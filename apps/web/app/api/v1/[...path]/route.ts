import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as data from '@database/index';
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
  const user = data.session(token);
  const json = (value: unknown, status = 200) =>
    NextResponse.json(value, {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId },
    });
  try {
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin');
      const expectedOrigin =
        process.env.APP_ORIGIN || `${req.nextUrl.protocol}//${req.headers.get('host')}`;
      if (origin && origin !== expectedOrigin)
        return json({ error: 'Cross-origin request rejected.', requestId }, 403);
      if (Number(req.headers.get('content-length') ?? 0) > 16384)
        return json({ error: 'Request too large.', requestId }, 413);
      const key = user?.id || req.headers.get('x-forwarded-for') || 'local';
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
        return json({ status: 'ok', mode: 'demo', database: data.admin().counts.products > 0 });
      if (path[0] === 'session')
        return json({
          user: user ?? null,
          ...(user ? data.personal(user.id) : { watches: [], rules: [], notifications: [] }),
        });
      if (path[0] === 'search' || path[0] === 'suggestions') {
        const query = (req.nextUrl.searchParams.get('q') || '').toLowerCase();
        const category = req.nextUrl.searchParams.get('category');
        const sort = req.nextUrl.searchParams.get('sort');
        let products = data
          .catalog()
          .filter(
            (p) =>
              (!category || p.category === category) &&
              `${p.name} ${p.subtitle} ${p.brand}`.toLowerCase().includes(query),
          );
        const all = data.offers();
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
          mode: 'demo',
        });
      }
      if (path[0] === 'products') {
        const product = data.findProduct(path[1]);
        if (!product) return json({ error: 'Product not found.', requestId }, 404);
        return json({
          product,
          offers: data.offers(product.id),
          history: data.history(
            product.id,
            Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30)),
          ),
          mode: 'demo',
        });
      }
      if (path[0] === 'admin') return json(data.admin());
      if (path[0] === 'export') {
        if (!user) return json({ error: 'Start a demo session first.', requestId }, 401);
        return json({ user, ...data.personal(user.id) });
      }
    }
    if (req.method === 'POST' && path[0] === 'session') {
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
      if (token) data.logout(token);
      const res = json({ ok: true });
      res.cookies.delete('atlas_session');
      return res;
    }
    if (req.method === 'POST' && path[0] === 'imports') {
      const body = z.object({ url: z.string().max(2000) }).parse(await req.json());
      const parsed = parseRetailUrl(body.url);
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
        !configured ||
        provided.length !== configured.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(configured))
      )
        return json({ error: 'Operator actions require the server ADMIN_TOKEN.', requestId }, 403);
      if (path[1] === 'collect') return json(data.collect());
      if (path[1] === 'provider') {
        const b = z
          .object({
            store: z.enum(['Amazon', 'Flipkart']),
            paused: z.boolean(),
            reason: z.string().min(3).max(300),
          })
          .parse(await req.json());
        data.pauseProvider(b.store, b.paused, 'operator', b.reason);
        return json({ ok: true });
      }
    }
    if (!user)
      return json({ error: 'Start a demo session to save products and targets.', requestId }, 401);
    if (path[0] === 'watches') {
      if (req.method === 'POST') {
        const b = z
          .object({
            productId: z.string().max(100),
            collection: z.string().trim().min(1).max(60).optional(),
          })
          .parse(await req.json());
        data.saveWatch(user.id, b.productId, b.collection);
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        data.removeWatch(user.id, path[1]);
        return json({ ok: true });
      }
    }
    if (path[0] === 'rules') {
      if (req.method === 'POST' || req.method === 'PATCH') {
        const rule = data.saveRule(user.id, ruleSchema.parse(await req.json()));
        data.dispatch();
        return json({ rule }, 201);
      }
      if (req.method === 'DELETE') {
        data.deleteRule(user.id, path[1]);
        return json({ ok: true });
      }
    }
    if (path[0] === 'preferences' && req.method === 'PATCH') {
      const b = z.object({ enabled: z.boolean() }).parse(await req.json());
      data.preferences(user.id, b.enabled);
      return json({ ok: true });
    }
    if (path[0] === 'account' && req.method === 'DELETE') {
      data.deleteAccount(user.id);
      const res = json({ ok: true });
      res.cookies.delete('atlas_session');
      return res;
    }
    if (path[0] === 'reports' && req.method === 'POST') {
      const b = z
        .object({ productId: z.string().max(100), reason: z.string().trim().min(5).max(1000) })
        .parse(await req.json());
      return json({ reference: data.report(user.id, b.productId, b.reason) }, 201);
    }
    return json({ error: 'Endpoint not found.', requestId }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: error.issues[0]?.message || 'Invalid input.', requestId }, 400);
    return json(
      { error: error instanceof Error ? error.message : 'Request failed.', requestId },
      400,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
