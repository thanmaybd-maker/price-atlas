import { test, expect } from '@playwright/test';

test('RTX discovery completes before optional AI responds and does not restart for a late rewrite', async ({
  page,
}) => {
  let finishAssist = () => {};
  const queries: string[] = [];
  const original = 'rtx 5060';
  const refined = 'NVIDIA RTX 5060 graphics card';
  await page.route('**/api/v1/assist?*', async (route) => {
    await new Promise<void>((resolve) => {
      finishAssist = resolve;
    });
    await route.fulfill({ json: { available: true, original, refined } });
  });
  await page.route('**/api/v1/ai-discover?*', (route) =>
    route.fulfill({ json: { available: false, candidates: [], sources: [] } }),
  );
  await page.route('**/api/v1/discovery', (route) => {
    queries.push(route.request().postDataJSON().query);
    return route.fulfill({
      json: {
        state: 'complete',
        products: [
          {
            id: 'rtx-gpu-fixture',
            slug: 'rtx-gpu-fixture',
            name: 'MSI GeForce RTX 5060 8GB Graphic Card',
            brand: 'MSI',
            category: 'other',
            color: '',
            subtitle: 'GPU listing',
            description: '',
            attributes: { Retailer: 'Amazon' },
            basePrice: 0,
            accent: '#047857',
            sourceKind: 'live',
          },
        ],
        offers: [],
        candidates: [],
        sources: [{ store: 'Amazon', method: 'direct', status: 'complete' }],
      },
    });
  });
  try {
    await page.goto('/search?q=rtx+5060', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => queries, { timeout: 2500 }).toEqual([original]);
    const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
    if (await skip.isVisible()) await skip.click();
    await expect(page.locator('a.product-name[href="/p/rtx-gpu-fixture"]')).toBeVisible();
    finishAssist();
    await expect(page.locator('.assist-note')).toContainText(refined);
    await page.waitForLoadState('networkidle');
    expect(queries).toEqual([original]);
    await expect(page.locator('a.product-name[href="/p/rtx-gpu-fixture"]')).toBeVisible();
  } finally {
    finishAssist();
  }
});
