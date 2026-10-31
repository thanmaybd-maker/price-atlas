import { expect, it } from 'vitest';
import { postDiscord, validDiscordWebhook } from '../packages/notifications/discord';

it('accepts only Discord webhook URLs', () => {
  expect(
    validDiscordWebhook(
      'https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz_-12',
    ),
  ).toBe(true);
  expect(
    validDiscordWebhook(
      'https://discordapp.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz',
    ),
  ).toBe(true);
  expect(
    validDiscordWebhook('https://evil.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz'),
  ).toBe(false);
  expect(
    validDiscordWebhook('http://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz'),
  ).toBe(false);
});
it('posts without mentions and maps a deleted webhook', async () => {
  let body: Record<string, unknown> = {};
  await postDiscord('https://discord.com/api/webhooks/1/x', 'hi', (async (
    _u: unknown,
    init?: RequestInit,
  ) => {
    body = JSON.parse(String(init?.body));
    return new Response('{}');
  }) as typeof fetch);
  expect(body).toMatchObject({ content: 'hi', allowed_mentions: { parse: [] } });
  await expect(
    postDiscord(
      'https://discord.com/api/webhooks/1/x',
      'hi',
      (async () => new Response('', { status: 404 })) as typeof fetch,
    ),
  ).rejects.toThrow('webhook_deleted');
});
