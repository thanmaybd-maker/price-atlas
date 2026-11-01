import { test, expect } from '@playwright/test';

test('background research polls without blocking search and refreshes matching products', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let polls = 0,
    lookups = 0;
  await page.route('**/api/v1/assist?*', (route) => route.fulfill({ json: { available: false } }));
  await page.route('**/api/v1/discovery', (route) => {
    lookups++;
    return route.fulfill({
      json: {
        state: 'complete',
        offers: [],
        candidates: [],
        sources: [],
        products:
          lookups > 1
            ? [
                {
                  id: 'agent-fixture-qx991',
                  slug: 'agent-fixture-qx991',
                  name: 'Queue Fixture QX991',
                  brand: 'Fixture',
                  category: 'other',
                  color: '',
                  subtitle: '',
                  description: '',
                  attributes: {},
                  basePrice: 0,
                  accent: '#047857',
                  sourceKind: 'live',
                },
              ]
            : [],
      },
    });
  });
  await page.route('**/api/v1/ai-discover?*', (route) => {
    polls++;
    return route.fulfill({
      json: {
        provider: 'antigravity',
        available: true,
        query: 'Queue Fixture QX991',
        candidates:
          polls > 1
            ? [
                {
                  title: 'Queue Fixture QX991',
                  store: 'Amazon',
                  url: 'https://www.amazon.in/dp/B0TEST1234',
                  quotedRupees: null,
                },
              ]
            : [],
        sources: [],
        reason: polls > 1 ? undefined : 'pending',
        otherVariants:
          polls > 1
            ? [
                {
                  title: 'Queue Fixture QX991 Pack of 2',
                  store: 'Meesho',
                  url: 'https://www.meesho.com/item/p/de4nwt',
                  quotedRupees: null,
                },
              ]
            : [],
      },
    });
  });
  await page.goto('/search?q=Queue+Fixture+QX991');
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole('heading', { name: 'Checking additional retailers…' })).toBeVisible();
  expect(lookups).toBeGreaterThan(0);
  await expect(page.locator('a.product-name[href="/p/agent-fixture-qx991"]')).toBeVisible();
  await expect(page.getByText('Antigravity research', { exact: true })).toBeVisible();
  await expect(page.getByText('Store links found by Antigravity.', { exact: false })).toBeVisible();
  expect(polls).toBe(2);
  await expect(page.getByText('Other variants and pack sizes (1)')).toBeVisible();
  await expect(page.getByText('Queue Fixture QX991 Pack of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reliance Digital', exact: true })).toBeVisible();
  await page.screenshot({ path: 'data/agent-research-mobile.png', fullPage: true });
});

test('offline research has an honest fallback and does not keep polling', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/v1/assist?*', (route) => route.fulfill({ json: { available: false } }));
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: { state: 'complete', offers: [], candidates: [], products: [], sources: [] },
    }),
  );
  await page.route('**/api/v1/ai-discover?*', (route) => {
    polls++;
    return route.fulfill({
      json: {
        provider: 'antigravity',
        available: true,
        candidates: [],
        sources: [],
        reason: 'offline',
      },
    });
  });
  await page.goto('/search?q=Background+Research+QX992');
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(
    page.getByText(
      'Background research is unavailable. Recorded products and store search still work.',
    ),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(polls).toBe(1);
  await page.screenshot({ path: 'data/agent-research-desktop.png', fullPage: true });
});
