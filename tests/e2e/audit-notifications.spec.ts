import { test, expect } from '@playwright/test';

test('blocked retailer pages offer honest recovery without promising a stronger retry', async ({
  page,
}) => {
  const url = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4';
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: {
        state: 'complete',
        products: [],
        offers: [],
        candidates: [],
        sources: [{ store: 'Flipkart', method: 'product-page', status: 'blocked' }],
        message:
          'The retailer returned a verification page. Configure a supported collection provider.',
      },
    }),
  );
  await page.goto(`/search?q=${encodeURIComponent(url)}`, { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(
    page.getByRole('heading', { name: 'Couldn’t read that store page this time.' }),
  ).toBeVisible();
  await expect(page.locator('.empty-state')).not.toContainText('stronger connection');
  await expect(page.locator('.empty-state')).not.toContainText('Configure a supported');
  await expect(page.getByRole('link', { name: 'Open on the store' })).toHaveAttribute('href', url);
  await expect(
    page.getByRole('link', { name: 'Search this product at other stores' }),
  ).toHaveAttribute('href', '/search?q=apple%20iphone%2015%20black%20128%20gb');
});

async function signedIn(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'notification-ui-fixture', name: 'UI fixture', notifications: 1 },
        watches: [],
        rules: [],
        notifications: [],
        delivery: { emailAvailable: false },
      },
    }),
  );
  await page.route('**/api/v1/telegram', (route) =>
    route.fulfill({ json: { configured: true, connected: true } }),
  );
}

test('Telegram test network failure shows recovery instead of an unhandled rejection', async ({
  page,
}) => {
  await signedIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/telegram?test=1', (route) => route.abort('failed'));
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Send test message', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not confirm the test message' }),
  ).toContainText(/could not confirm|network|connection/i);
  await expect(page.getByRole('button', { name: 'Send test message', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Telegram test never reports success on an unsuccessful HTTP response', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/v1/telegram?test=1', (route) =>
    route.fulfill({ status: 503, json: { ok: true } }),
  );
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Send test message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 503');
  await expect(
    page.getByText('Test message sent. Check your Telegram chat with the bot.', { exact: true }),
  ).toHaveCount(0);
});

test('tablet and desktop keep main routes usable in both themes', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      const control = page.getByRole('combobox', { name: 'Color theme' });
      await expect(control).toBeEnabled();
      await control.selectOption(theme);
      for (const path of ['/', '/search', '/p/amazon-b09xs7jwhh', '/settings']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width} ${theme} ${path}`,
        ).toBe(true);
      }
      await page.screenshot({ path: `data/audit-settings-${width}-${theme}.png` });
    }
  }
  expect(errors).toEqual([]);
});
