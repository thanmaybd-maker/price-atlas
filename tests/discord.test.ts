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
    validDiscordWebhook(
      'https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz_-12/',
    ),
  ).toBe(true);
  expect(
    validDiscordWebhook(
      'https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz_-12?wait=true',
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

it('retries on short 429 rate limit and succeeds', async () => {
  let callCount = 0;
  const mockFetch = (async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('{"message":"Rate limited"}', {
        status: 429,
        headers: { 'retry-after': '0.01' },
      });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  await postDiscord('https://discord.com/api/webhooks/1/x', 'retry me', mockFetch);
  expect(callCount).toBe(2);
});

it('throws http_500 on server errors', async () => {
  const failingFetch = (async () =>
    new Response('Internal error', { status: 500 })) as typeof fetch;
  await expect(
    postDiscord('https://discord.com/api/webhooks/1/x', 'fail', failingFetch),
  ).rejects.toThrow('http_500');
});

import { alertEmbed } from '../packages/notifications/discord';
it('builds an alert card with price, target, savings, link and image', () => {
  const e = alertEmbed(
    {
      title: 'iPad Pro',
      store: 'Flipkart',
      price: 22509900,
      target: 25000000,
      productId: 'flipkart-x',
    },
    'https://example.test',
    'https://img.test/a.jpg',
  );
  expect(e.url).toBe('https://example.test/p/flipkart-x');
  expect(e.fields?.map((f) => f.name)).toEqual(['Price now', 'Your target', 'Under target by']);
  expect(e.thumbnail?.url).toBe('https://img.test/a.jpg');
  expect(
    alertEmbed(
      { title: 't', store: 's', price: 1, target: 1, productId: 'p' },
      'https://o',
      'http://x',
    ).thumbnail,
  ).toBeUndefined();
});
