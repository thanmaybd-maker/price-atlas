import { test, expect } from '@playwright/test';

test('target options are requested only after opening the picker and stay bounded', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/suggestions')) requests++;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const product = page.getByLabel('Product', { exact: true });
  await expect(product).toBeVisible();
  expect(await product.locator('option').count()).toBeLessThanOrEqual(9);
  expect(requests).toBe(0);
  await page.getByLabel('Find a product', { exact: true }).fill('Casio');
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(product).toContainText('Casio');
  expect(await product.locator('option').count()).toBeLessThanOrEqual(25);
});

test('catalog counts explain their different scopes and source evidence has an absolute timestamp', async ({
  page,
  request,
}) => {
  const current = await (await request.get('/api/v1/catalog/status')).json();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('catalog-coverage')).toContainText(
    `${current.products} catalog products`,
  );
  await expect(page.getByTestId('catalog-coverage')).toContainText(
    `${current.expansion.verifiedBaseProducts} verified by bulk importer`,
  );
  const evidence = page.locator('.offer-evidence').first();
  await evidence.locator('summary').click();
  await expect(evidence.getByRole('link', { name: 'Open retailer product page' })).toHaveAttribute(
    'href',
    /^https:\/\//,
  );
  expect(
    Date.parse((await evidence.locator('time').getAttribute('datetime')) || ''),
  ).toBeGreaterThan(0);
  await expect(evidence).toContainText('Comparison basis');
  await expect(evidence).toContainText(/Method not recorded|retailer HTML/i);
  await page.locator('.hs .wa').screenshot({ path: 'data/review-evidence-proof.png' });
});

test('discovery rejects wrong Kobo models and cases and lists all retailer outcomes', async ({
  page,
}) => {
  await page.route('**/api/v1/discovery', (route) =>
    route.fulfill({
      json: {
        state: 'complete',
        products: [],
        offers: [],
        candidates: [
          {
            title: 'Case for Kobo Clara 2E',
            store: 'Amazon',
            url: 'https://www.amazon.in/dp/B000000001',
          },
          {
            title: 'Case for Kobo Libra Colour',
            store: 'Amazon',
            url: 'https://www.amazon.in/dp/B000000002',
          },
          {
            title: 'Kobo Libra Colour e-reader',
            store: 'Amazon',
            url: 'https://www.amazon.in/dp/B000000003',
          },
        ],
        sources: [
          { store: 'Nykaa', method: 'direct', status: 'blocked' },
          { store: 'Croma', method: 'direct', status: 'no_results' },
        ],
      },
    }),
  );
  await page.goto('/search?q=Kobo+Libra+Colour', { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('button', { name: 'Show recorded results' });
  if (await skip.isVisible()) await skip.click();
  await page.getByText('Discovery links · live prices unverified', { exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Verify details: Kobo Libra Colour e-reader', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Verify details: Case for Kobo Clara 2E', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Verify details: Case for Kobo Libra Colour', exact: true }),
  ).toHaveCount(0);
  const outcomes = page.locator('.retailer-outcomes');
  await outcomes.locator('summary').click();
  await expect(outcomes.locator('li')).toHaveCount(10);
  await expect(outcomes).toContainText('Blocked by retailer');
  await expect(outcomes).toContainText('No matching product found');
  await expect(outcomes).toContainText('Not checked');
});
