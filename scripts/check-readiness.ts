import 'dotenv/config';
import { postgres, offers, catalog } from '../packages/database/postgres';
import { eligible } from '../packages/domain/index';
const report: Record<string, unknown> = {};
const origin = process.env.EMAIL_LINK_ORIGIN || 'https://price-atlas-ashen.vercel.app';
const checks = await Promise.allSettled([
  (async () => {
    const products = await catalog(),
      current = await offers();
    report.catalog = {
      products: products.length,
      freshInStock: current.filter((o) => eligible(o, Date.now())).length,
      categories: Object.fromEntries(
        [...new Set(products.map((p) => p.category))].map((c) => [
          c,
          products.filter((p) => p.category === c).length,
        ]),
      ),
    };
    report.budget =
      (
        await postgres().query(
          'SELECT day,requests,credits FROM atlas.collection_budget ORDER BY day DESC LIMIT 1',
        )
      ).rows[0] || null;
    report.latestCollection =
      (
        await postgres().query(
          'SELECT started_at,status,observations FROM atlas.runs ORDER BY started_at DESC LIMIT 1',
        )
      ).rows[0] || null;
  })(),
  (async () => {
    const response = await fetch(new URL('/api/v1/health', origin), {
      signal: AbortSignal.timeout(15000),
    });
    report.web = { httpStatus: response.status, ...(await response.json()) };
  })(),
  (async () => {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || '' },
      signal: AbortSignal.timeout(15000),
    });
    const settings = await response.json();
    report.auth = {
      status: response.status,
      googleEnabled: settings.external?.google === true,
      signupEnabled: settings.disable_signup === false,
    };
  })(),
  (async () => {
    if (!process.env.SCRAPINGBEE_API_KEY) {
      report.scrapingBee = { configured: false };
      return;
    }
    const response = await fetch('https://app.scrapingbee.com/api/v1/usage', {
      headers: { Authorization: `Bearer ${process.env.SCRAPINGBEE_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    const usage = await response.json();
    report.scrapingBee = {
      status: response.status,
      remainingCredits: Number(usage.max_api_credit) - Number(usage.used_api_credit),
    };
  })(),
  (async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      report.telegram = { configured: false };
      return;
    }
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
      { signal: AbortSignal.timeout(15000) },
    );
    const data = await response.json();
    const probe = await fetch(new URL('/api/webhooks/telegram', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ update_id: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    report.telegram = {
      providerOk: data.ok === true,
      webhookRegistered: data.result?.url === new URL('/api/webhooks/telegram', origin).href,
      hostedSecretMatches: probe.ok,
      pendingUpdates: data.result?.pending_update_count,
    };
  })(),
]);
report.failedChecks = checks
  .map((r, i) => (r.status === 'rejected' ? i : null))
  .filter((i) => i !== null);
console.log(JSON.stringify(report, null, 2));
if (checks.some((r) => r.status === 'rejected')) process.exitCode = 1;
await postgres().end();
