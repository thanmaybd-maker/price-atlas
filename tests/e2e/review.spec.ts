import { test, expect } from '@playwright/test';

test('archived history exposes capture proof in both the 30-day table and seven-day receipt', async ({
  page,
}) => {
  await page.route(/\/api\/v1\/history\?/, async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    const product = result.products[0];
    if (!product) throw new Error('History fixture needs one catalog product');
    const observedAt = Math.floor((Date.now() - 86400000) / 1000) * 1000;
    const timestamp = new Date(observedAt).toISOString().replace(/\D/g, '').slice(0, 14);
    const originalUrl = 'https://www.amazon.in/dp/B09XS7JWHH';
    const archiveUrl = `https://web.archive.org/web/${timestamp}/${originalUrl}`;
    const observation = {
      id: 'archive-browser-fixture',
      productId: product.id,
      store: 'Amazon',
      itemPrice: 1948900,
      shipping: 0,
      charges: 0,
      discount: 0,
      currency: 'INR',
      stock: true,
      accepted: true,
      condition: 'new',
      observedAt,
      validUntil: observedAt,
      historyAllowed: true,
      displayAllowed: false,
      alertsAllowed: false,
      seller: 'Fixture',
      context: 'Internet Archive snapshot',
      source: 'wayback',
      purchaseUrl: archiveUrl,
      evidence: {
        kind: 'archive',
        extraction: 'archived retailer HTML',
        parserVersion: 'fixture',
        originalUrl,
        archiveUrl,
        rawArchiveUrl: `https://web.archive.org/web/${timestamp}id_/${originalUrl}`,
        captureTimestamp: timestamp,
        verifiedLiveByPriceAtlas: false,
        matchedAttributes: ['Brand'],
      },
    };
    await route.fulfill({
      json: { products: [product], history: { [product.id]: [observation] } },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('history-coverage')).toContainText('1 of 30 days');
  await page.getByText('View recorded daily prices', { exact: true }).click();
  const table = page.locator('.tide-data');
  await expect(
    table.getByRole('link', { name: 'Internet Archive capture', exact: true }),
  ).toHaveAttribute('href', /^https:\/\/web.archive.org\/web\//);
  await expect(table).toContainText('not a live check');
  expect(Date.parse((await table.locator('time').getAttribute('datetime')) || '')).toBeGreaterThan(
    0,
  );
  await expect(page.getByText('Includes Internet Archive captures', { exact: true })).toBeVisible();
  await page.getByText('Includes Internet Archive captures', { exact: true }).click();
  await expect(page.locator('.hs .do .rx')).toContainText('not live checks');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('.al-sheet').screenshot({ path: `data/archive-evidence-${width}.png` });
  }
});

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
