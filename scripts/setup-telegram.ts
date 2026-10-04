import 'dotenv/config';
import { telegramConfigured } from '../packages/notifications/telegram';
if (!telegramConfigured()) {
  console.error(
    'Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET (32+ characters) in the private environment.',
  );
  process.exitCode = 1;
} else {
  const origin =
    process.env.TELEGRAM_WEBHOOK_ORIGIN || process.env.EMAIL_LINK_ORIGIN || process.env.APP_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:')
    throw new Error('Set the HTTPS deployment origin.');
  const call = async (method: string, body: unknown = {}) => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await res.json();
      if (!result.ok) throw new Error('api_failed');
      return result.result;
    } catch {
      throw new Error(`Telegram ${method} failed; check the private token and connectivity.`);
    }
  };
  try {
    const bot = await call('getMe');
    if (String(bot.username).toLowerCase() !== process.env.TELEGRAM_BOT_USERNAME!.toLowerCase())
      throw new Error('Bot username does not match the configured token.');
    const endpoint = new URL('/api/webhooks/telegram', origin).href;
    const health = await fetch(new URL('/api/v1/health', origin), {
      signal: AbortSignal.timeout(15000),
    });
    if (!health.ok || (await health.json()).mode !== 'live')
      throw new Error('The hosted app must be in live mode before webhook registration.');
    const probe = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (probe.status !== 401)
      throw new Error(
        'Deploy the Telegram route and configure its private environment first. Expected a protected webhook (401).',
      );
    const authenticatedProbe = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ update_id: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!authenticatedProbe.ok)
      throw new Error(
        'The hosted webhook secret does not match the local environment. Synchronize TELEGRAM_WEBHOOK_SECRET before registration.',
      );
    await call('setWebhook', {
      url: endpoint,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
    const info = await call('getWebhookInfo');
    console.log(
      JSON.stringify({
        registered: info.url === endpoint,
        pendingUpdates: info.pending_update_count,
        botUsername: bot.username,
      }),
    );
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
