import { test, expect } from '@playwright/test';

test('budget-limited product links show the cause instead of blaming the retailer', async ({
  page,
}) => {
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: {
        state: 'complete',
        products: [],
        offers: [],
        candidates: [],
        message: 'The daily collection limit has been reached. Tracking resumes tomorrow.',
        sources: [{ store: 'B&H', method: 'product-page', status: 'daily_budget' }],
      },
    }),
  );
  const url =
    'https://www.bhphotovideo.com/c/product/1909629-REG/asus_rog_astral_rtx5090_o32g_white_rog_astral_geforce_rtx.html';
  await page.goto('/search?q=' + encodeURIComponent(url));
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole('heading', { name: 'Collection allowance reached' })).toBeVisible();
  await expect(
    page
      .getByText('The daily collection limit has been reached. Tracking resumes tomorrow.', {
        exact: true,
      })
      .last(),
  ).toBeVisible();
  await expect(page.getByText(/This store page could not be verified/)).toHaveCount(0);
});

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

test('queued research shows its position and ends the spinner at its deadline', async ({
  page,
}) => {
  await page.clock.install();
  await page.route('**/api/v1/assist?*', (route) => route.fulfill({ json: { available: false } }));
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: {
        state: 'complete',
        offers: [],
        candidates: [],
        products: [],
        sources: [],
      },
    }),
  );
  await page.route('**/api/v1/ai-discover?*', (route) =>
    route.fulfill({
      json: {
        provider: 'antigravity',
        available: true,
        candidates: [],
        sources: [],
        reason: 'pending',
        stage: 'queued',
        queuePosition: 2,
      },
    }),
  );
  await page.goto('/search?q=Queue+Deadline+QX993');
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole('heading', { name: 'Search queued' })).toBeVisible();
  await expect(page.getByText(/waiting for the research worker \(position 2\)/)).toBeVisible();
  await page.clock.fastForward(360001);
  await expect(
    page.getByText(
      'Background research could not finish. You can still paste a product link to check it.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Additional retailer research' })).toHaveAttribute(
    'aria-busy',
    'false',
  );
});
