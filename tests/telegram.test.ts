import { afterEach, expect, it, vi } from 'vitest';
import { sendTelegram, telegramSecretValid } from '../packages/notifications/telegram';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('rejects absent or mismatched webhook secrets', () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-webhook-secret-with-more-than-32-chars');
  expect(telegramSecretValid(null)).toBe(false);
  expect(telegramSecretValid('wrong')).toBe(false);
  expect(telegramSecretValid('test-webhook-secret-with-more-than-32-chars')).toBe(true);
});
it('sends plain text without HTML parsing or preview leakage and records a message receipt', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await sendTelegram('123', 'Product <name>')).toBe('42');
  const options = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(options[1].body))).toEqual({
    chat_id: '123',
    text: 'Product <name>',
    link_preview_options: { is_disabled: true },
  });
});
it('uses Telegram’s rate-limit delay without exposing provider details', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 180 } }),
        { status: 429 },
      ),
  );
  await expect(sendTelegram('123', 'alert')).rejects.toMatchObject({
    code: 'rate_limited',
    retryAfter: 180,
  });
});
it('classifies blocked destinations and ambiguous network responses separately', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 403 }),
  );
  await expect(sendTelegram('123', 'alert')).rejects.toMatchObject({ code: 'blocked' });
  vi.stubGlobal('fetch', async () => {
    throw new Error('URL contains private token');
  });
  await expect(sendTelegram('123', 'alert')).rejects.toMatchObject({
    code: 'ambiguous',
    message: 'Telegram delivery could not be confirmed.',
  });
});
