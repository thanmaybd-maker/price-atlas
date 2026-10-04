import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@database/runtime';
import { account, authClient, isAdmin, safeReturn } from '@/lib/auth';
import { importScraped, postgres, reviewMatch, reviewAnomaly, retryJob } from '@database/postgres';
import { ScrapeError } from '../../../../../../packages/providers/scraper';
import { getSourceAdapter } from '../../../../../../packages/providers/index';
import { reserveSource } from '../../../../../../packages/jobs/index';
import { limited } from '../../../../../../packages/jobs/rate-limit';
import { verifyUnsubscribe } from '../../../../../../packages/notifications/index';
import { parseRetailUrl, rank } from '@domain/index';
import { randomUUID, timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().max(100),
  target: z.number().int().positive().max(10000000000),
  store: z.enum(['all', 'Amazon', 'Flipkart']).default('all'),
  basis: z.enum(['delivered', 'item']).default('delivered'),
  operator: z.enum(['lte', 'lt']).default('lte'),
  enabled: z.boolean().default(true),
});
const buckets = new Map<string, { count: number; until: number }>();
async function handler(req: NextRequest) {
  const requestId = randomUUID();
  const path = req.nextUrl.pathname.replace('/api/v1/', '').split('/');
  const token = req.cookies.get('atlas_session')?.value;
  let user: Awaited<ReturnType<typeof account>> = null;
  const json = (value: unknown, status = 200) =>
    NextResponse.json(value, {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId },
    });
  try {
    user = await account(token);
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin');
      const expectedOrigin =
        process.env.APP_ORIGIN || `${req.nextUrl.protocol}//${req.headers.get('host')}`;
      if (origin && origin !== expectedOrigin)
        return json({ error: 'Cross-origin request rejected.', requestId }, 403);
      if (Number(req.headers.get('content-length') ?? 0) > 16384)
        return json({ error: 'Request too large.', requestId }, 413);
      const key = user?.id || req.headers.get('x-forwarded-for') || 'local';
      if (
        data.isLive() &&
        (await limited(
          `${path[0]}:${key}`,
          path[0] === 'auth' ? 5 : path[0] === 'imports' ? 5 : 60,
        ))
      )
        return json({ error: 'Too many requests. Try again shortly.' }, 429);
      const now = Date.now();
      if (buckets.size > 10000) for (const [k, b] of buckets) if (b.until < now) buckets.delete(k);
      const bucket = buckets.get(key);
      if (bucket && bucket.until > now) {
        if (++bucket.count > 100)
          return json({ error: 'Too many requests. Try again shortly.', requestId }, 429);
      } else buckets.set(key, { count: 1, until: now + 60000 });
    }
    if (req.method === 'GET') {
      if (path[0] === 'health')
        return json({
          status: 'ok',
          mode: data.isLive() ? 'live' : 'demo',
          database: Boolean(await data.admin()),
        });
      if (path[0] === 'session')
        return json({
          user: user ?? null,
          ...(user ? await data.personal(user.id) : { watches: [], rules: [], notifications: [] }),
        });
      if (path[0] === 'search' || path[0] === 'suggestions') {
        const query = (req.nextUrl.searchParams.get('q') || '').toLowerCase();
        const category = req.nextUrl.searchParams.get('category');
        const sort = req.nextUrl.searchParams.get('sort');
        let products = (await data.catalog()).filter(
          (p) =>
            (!category || p.category === category) &&
            `${p.name} ${p.subtitle} ${p.brand}`.toLowerCase().includes(query),
        );
        const all = await data.offers();
        if (sort === 'price-asc')
          products.sort(
            (a, b) =>
              (rank(all.filter((o) => o.productId === a.id)).lowest ?? Infinity) -
              (rank(all.filter((o) => o.productId === b.id)).lowest ?? Infinity),
          );
        if (sort === 'price-desc')
          products.sort(
            (a, b) =>
              (rank(all.filter((o) => o.productId === b.id)).lowest ?? -Infinity) -
              (rank(all.filter((o) => o.productId === a.id)).lowest ?? -Infinity),
          );
        const cursor = Math.max(0, Number(req.nextUrl.searchParams.get('cursor')) || 0);
        return json({
          products: products.slice(cursor, cursor + 24),
          total: products.length,
          offers: all,
          nextCursor: products.length > cursor + 24 ? cursor + 24 : null,
          mode: data.isLive() ? 'live' : 'demo',
        });
      }
      if (path[0] === 'products') {
        const product = await data.findProduct(path[1]);
        if (!product) return json({ error: 'Product not found.', requestId }, 404);
        return json({
          product,
          offers: await data.offers(product.id),
          history: await data.history(
            product.id,
            Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30)),
          ),
          mode: data.isLive() ? 'live' : 'demo',
        });
      }
      if (path[0] === 'admin') {
        if (data.isLive() && !(await isAdmin()))
          return json({ error: 'Operator access requires an approved account with MFA.' }, 403);
        return json(await data.admin());
      }
      if (path[0] === 'export') {
        if (!user) return json({ error: 'Start a demo session first.', requestId }, 401);
        return json({ user, ...(await data.personal(user.id)) });
      }
    }
    if (req.method === 'POST' && path[0] === 'session') {
      if (data.isLive()) return json({ error: 'Use verified email or Google sign-in.' }, 400);
      const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(await req.json());
      const result = data.createSession(body.name);
      const res = json({ user: result.user });
      res.cookies.set('atlas_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 30 * 86400,
      });
      return res;
    }
    if (req.method === 'DELETE' && path[0] === 'session') {
      if (data.isLive()) await (await authClient()).auth.signOut();
      else if (token) data.logout(token);
      const res = json({ ok: true });
      res.cookies.delete('atlas_session');
      return res;
    }
    if (req.method === 'POST' && path[0] === 'imports') {
      const body = z.object({ url: z.string().max(2000) }).parse(await req.json());
      const parsed = parseRetailUrl(body.url);
      if (data.isLive()) {
        if (!user) return json({ error: 'Sign in to import a live product.' }, 401);
        await reserveSource(parsed.store);
        const result = await importScraped(
          await getSourceAdapter(parsed.store).scrape(body.url),
          `import-${randomUUID()}`,
        );
        return json({ status: result.quarantined ? 'review' : 'complete', ...result }, 201);
      }
      return json(
        {
          status: 'source_not_connected',
          ...parsed,
          message:
            'The link is valid. Live resolution needs an authorized source connection. Search the synthetic catalog to explore the demo.',
        },
        422,
      );
    }
    if (path[0] === 'admin' && req.method === 'POST') {
      const configured = process.env.ADMIN_TOKEN;
      const provided = req.headers.get('x-admin-token') || '';
      if (
        data.isLive()
          ? !(await isAdmin())
          : !configured ||
            provided.length !== configured.length ||
            !timingSafeEqual(Buffer.from(provided), Buffer.from(configured))
      )
        return json({ error: 'Operator actions require the server ADMIN_TOKEN.', requestId }, 403);
      if (path[1] === 'anomaly' && data.isLive()) {
        const b = z
          .object({
            id: z.string().max(100),
            accept: z.boolean(),
            reason: z.string().min(5).max(300),
          })
          .parse(await req.json());
        await reviewAnomaly(b.id, b.accept, user!.id, b.reason);
        return json({ ok: true });
      }
      if (path[1] === 'retry' && data.isLive()) {
        const b = z
          .object({ id: z.string().max(100), reason: z.string().min(5).max(300) })
          .parse(await req.json());
        await retryJob(b.id, user!.id, b.reason);
        return json({ ok: true });
      }
      if (path[1] === 'match' && data.isLive()) {
        const b = z
          .object({
            listingId: z.string().max(100),
            productId: z.string().max(100),
            reason: z.string().min(5).max(300),
          })
          .parse(await req.json());
        await reviewMatch(b.listingId, b.productId, user!.id, b.reason);
        return json({ ok: true });
      }
      if (path[1] === 'collect') return json(await data.collect());
      if (path[1] === 'provider') {
        const b = z
          .object({
            store: z.enum(['Amazon', 'Flipkart']),
            paused: z.boolean(),
            reason: z.string().min(3).max(300),
          })
          .parse(await req.json());
        await data.pauseProvider(b.store, b.paused, 'operator', b.reason);
        return json({ ok: true });
      }
    }
    if (path[0] === 'auth' && req.method === 'POST' && data.isLive()) {
      const body = z
        .object({
          provider: z.enum(['email', 'google']),
          email: z.email().max(254).optional(),
          next: z.string().max(2000).optional(),
        })
        .parse(await req.json());
      const client = await authClient();
      const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeReturn(body.next || null))}`;
      if (body.provider === 'email') {
        if (!body.email) return json({ error: 'Enter an email address.' }, 400);
        const { error } = await client.auth.signInWithOtp({
          email: body.email,
          options: { emailRedirectTo: redirectTo },
        });
        return error
          ? json(
              { error: 'Could not send the sign-in link. Check Supabase email configuration.' },
              400,
            )
          : json({ ok: true });
      }
      const { data: result, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      return error
        ? json({ error: 'Google sign-in is not enabled in Supabase.' }, 400)
        : json({ url: result.url });
    }
    if (path[0] === 'unsubscribe' && req.method === 'POST' && data.isLive()) {
      const body = z.object({ token: z.string().max(300) }).parse(await req.json());
      const id = verifyUnsubscribe(body.token);
      if (!id) return json({ error: 'This unsubscribe link is invalid or expired.' }, 400);
      await postgres().query('UPDATE atlas.users SET email_enabled=false WHERE id=$1', [id]);
      return json({ ok: true });
    }
    if (!user)
      return json({ error: 'Start a demo session to save products and targets.', requestId }, 401);
    if (path[0] === 'mfa' && req.method === 'POST' && data.isLive()) {
      const b = z
        .object({
          action: z.enum(['enroll', 'verify']),
          factorId: z.string().uuid().optional(),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(await req.json());
      const client = await authClient();
      if (b.action === 'enroll') {
        const factors = await client.auth.mfa.listFactors();
        const verified = factors.data?.totp.find((f) => f.status === 'verified');
        if (verified) return json({ id: verified.id, qr: null });
        const { data: factor, error } = await client.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Price Atlas operator',
        });
        if (error || !factor)
          return json(
            { error: 'Could not enroll an authenticator. Check existing factors in Supabase.' },
            400,
          );
        return json({
          id: factor.id,
          qr: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(factor.totp.qr_code),
        });
      }
      if (!b.factorId || !b.code)
        return json({ error: 'Enter your six-digit authenticator code.' }, 400);
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
        factorId: b.factorId,
      });
      if (challengeError || !challenge)
        return json({ error: 'Authenticator challenge failed.' }, 400);
      const { error } = await client.auth.mfa.verify({
        factorId: b.factorId,
        challengeId: challenge.id,
        code: b.code,
      });
      return error ? json({ error: 'The code was invalid or expired.' }, 400) : json({ ok: true });
    }
    if (path[0] === 'watches') {
      if (req.method === 'POST') {
        const b = z
          .object({
            productId: z.string().max(100),
            collection: z.string().trim().min(1).max(60).optional(),
          })
          .parse(await req.json());
        await data.saveWatch(user.id, b.productId, b.collection);
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        await data.removeWatch(user.id, path[1]);
        return json({ ok: true });
      }
    }
    if (path[0] === 'rules') {
      if (req.method === 'POST' || req.method === 'PATCH') {
        const rule = await data.saveRule(user.id, ruleSchema.parse(await req.json()));
        await data.dispatch();
        return json({ rule }, 201);
      }
      if (req.method === 'DELETE') {
        await data.deleteRule(user.id, path[1]);
        return json({ ok: true });
      }
    }
    if (path[0] === 'preferences' && req.method === 'PATCH') {
      const b = z
        .object({ enabled: z.boolean(), emailEnabled: z.boolean().optional() })
        .parse(await req.json());
      await data.preferences(user.id, b.enabled, b.emailEnabled);
      return json({ ok: true });
    }
    if (path[0] === 'account' && req.method === 'DELETE') {
      await data.deleteAccount(user.id);
      if (data.isLive()) await (await authClient()).auth.signOut();
      const res = json({ ok: true });
      res.cookies.delete('atlas_session');
      return res;
    }
    if (path[0] === 'reports' && req.method === 'POST') {
      const b = z
        .object({ productId: z.string().max(100), reason: z.string().trim().min(5).max(1000) })
        .parse(await req.json());
      return json({ reference: await data.report(user.id, b.productId, b.reason) }, 201);
    }
    return json({ error: 'Endpoint not found.', requestId }, 404);
  } catch (error) {
    if (error instanceof ScrapeError)
      return json(
        { error: error.message, code: error.code, requestId },
        error.code === 'rate_limited' ? 429 : 502,
      );
    if (error instanceof z.ZodError)
      return json({ error: error.issues[0]?.message || 'Invalid input.', requestId }, 400);
    return json(
      {
        error: data.isLive()
          ? 'The operation could not be completed. Check configuration or contact support with this request ID.'
          : error instanceof Error
            ? error.message
            : 'Request failed.',
        requestId,
      },
      400,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
