import { test, expect } from '@playwright/test';

test('a product page surfaces another retailer without merging uncertain variants', async ({
  page,
}) => {
  await page.goto('/p/amazon-b0dsknkcyx', { waitUntil: 'domcontentloaded' });
  const panel = page.getByRole('region', { name: 'Other retailer listings and variants' });
  await expect(panel.getByRole('heading', { name: 'Check other retailers' })).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Search all retailers for this product' }),
  ).toHaveAttribute('href', '/search?q=Samsung%20galaxy%20s25%20ultra&store=all');
  await expect(panel.locator('a.product-name[href="/p/flipkart-mobh8k8uvngvngkn"]')).toHaveCount(1);
  await expect(panel).toContainText('Each price belongs to its own listing');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.screenshot({ path: `data/multistore-product-${width}.png` });
  }
});

test('all-store name search renders both returned retailer listings and honest source outcomes', async ({
  page,
}) => {
  const now = Date.now();
  const products = ['Amazon', 'Flipkart'].map((store) => ({
    id: `multi-${store.toLowerCase()}-fixture`,
    slug: `multi-${store.toLowerCase()}-fixture`,
    name: 'Samsung Galaxy S25 Ultra 12GB RAM 256GB Storage',
    brand: 'Samsung',
    category: 'phones',
    color: 'Not supplied',
    subtitle: `${store} listing`,
    description: '',
    attributes: { Retailer: store },
    basePrice: 10000000,
    accent: '#047857',
    sourceKind: 'live',
  }));
  const offers = products.map((p, index) => ({
    id: p.id + '-offer',
    productId: p.id,
    store: p.attributes.Retailer,
    itemPrice: 10000000 + index * 100,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: now,
    validUntil: now + 3600000,
    historyAllowed: true,
    displayAllowed: true,
    alertsAllowed: true,
    seller: '',
    context: '',
  }));
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: {
        state: 'complete',
        products,
        offers,
        candidates: [],
        sources: [
          { store: 'Amazon', method: 'recorded-catalog', status: 'complete' },
          { store: 'Flipkart', method: 'direct', status: 'complete' },
          { store: 'Croma', method: 'direct', status: 'blocked' },
          { store: 'Reliance Digital', method: 'web-search', status: 'no_results' },
        ],
      },
    }),
  );
  await page.goto('/search?q=Samsung+S25+Ultra&exact=1&store=all', {
    waitUntil: 'domcontentloaded',
  });
  const skip = page.getByRole('button', { name: 'Skip Animation', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('a.product-name[href="/p/multi-amazon-fixture"]')).toBeVisible();
  await expect(page.locator('a.product-name[href="/p/multi-flipkart-fixture"]')).toBeVisible();
  await page.getByText('Retailer check outcomes', { exact: true }).click();
  await expect(page.locator('.retailer-outcomes li').filter({ hasText: 'Croma' })).toContainText(
    'Blocked by retailer',
  );
  await expect(
    page.locator('.retailer-outcomes li').filter({ hasText: 'Reliance Digital' }),
  ).toContainText('No matching product found');
});
