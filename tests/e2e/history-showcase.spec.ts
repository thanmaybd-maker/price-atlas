import { test, expect } from '@playwright/test';

test('home defaults to our strongest history even for a user with saved products, with honest daily streaks', async ({
  page,
  request,
}) => {
  const catalog = await (await request.get('/api/v1/search?q=Sony')).json();
  const product = catalog.products[0];
  expect(product).toBeTruthy();
  const now = Date.now(),
    start = Math.floor((now + 19800000) / 86400000) * 86400000 - 19800000;
  const observations = Array.from({ length: 5 }, (_, i) => ({
    id: `history-fixture-${i}`,
    productId: product.id,
    store: 'Amazon',
    itemPrice: 1998900,
    shipping: null,
    charges: 0,
    discount: 0,
    currency: 'INR',
    stock: true,
    accepted: true,
    condition: 'new',
    observedAt: start - i * 86400000 + 1,
    validUntil: now - 1,
    historyAllowed: true,
    displayAllowed: true,
    alertsAllowed: false,
    seller: '',
    context: '',
    source: 'primary',
  }));
  const ids: (string | null)[] = [];
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'history-ui-fixture', name: 'History fixture', notifications: 1 },
        watches: [{ product_id: product.id }],
        rules: [],
        notifications: [],
        delivery: { emailAvailable: false },
      },
    }),
  );
  await page.route('**/api/v1/history?*', (route) => {
    ids.push(new URL(route.request().url()).searchParams.get('ids'));
    return route.fulfill({
      json: { products: [product], history: { [product.id]: observations } },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const picker = page.getByRole('combobox', { name: 'Home history products' });
  await picker.scrollIntoViewIfNeeded();
  await expect(picker).toHaveValue('coverage');
  await expect(page.getByTestId('history-recording-streak')).toContainText('5 distinct days');
  await expect(page.getByTestId('history-recording-streak')).toContainText('5 consecutive days');
  expect(ids[0]).toBeNull();
  await picker.selectOption('saved');
  await expect.poll(() => ids.at(-1)).toBe(product.id);
  await expect(page.getByTestId('history-recording-streak')).toContainText(
    'Imported history does not count',
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
