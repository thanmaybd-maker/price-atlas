import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('lookup animation can be skipped while the factual search response is still pending', async ({
  page,
  request,
}) => {
  const facts = await (await request.get('/api/v1/search?q=Casio')).json();
  test.skip(facts.mode !== 'live', 'The asynchronous discovery animation is a live-mode flow.');
  let release: (() => void) | undefined;
  await page.route('**/api/v1/discovery', async (route) => {
    await new Promise<void>((done) => {
      release = done;
    });
    await route.fulfill({ json: { state: 'complete', ...facts, candidates: [], sources: [] } });
  });
  await page.goto('/search?q=Casio', { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('button', { name: 'Show recorded results' });
  await expect(skip).toBeEnabled();
  await skip.click();
  await expect(page.locator('.v2-flower')).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true);
  release?.();
  await expect(page.locator('.product-card').first()).toBeVisible();
});

test('home retains neutral chips and accessible mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Nykaa', exact: true }).click();
  await expect(page.locator('.v2-store.on')).toHaveCount(1);
  const colors = await page
    .locator('.v2-store')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
  expect(new Set(colors).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual(
    [],
  );
});

test('unknown pages and endpoint suffixes return 404', async ({ page, request }) => {
  for (const path of [
    '/this-page-does-not-exist',
    '/category/no-such-category',
    '/api/v1/health/extra',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('link', { name: 'Back to Price Atlas' })).toBeVisible();
});

test('ring can pause and keeps a readable fallback without WebGL or storage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await expect(page.getByRole('button', { name: 'Play animation' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage'])
      Object.defineProperty(window, key, {
        configurable: true,
        get() {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return /webgl/i.test(type)
        ? null
        : original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.reload();
  await expect(page.locator('.v2-ring')).toHaveClass(/ready/);
  await expect(
    page.getByText('Compare recorded prices across stores', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Search products or paste a retailer link').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('history basis, CSV evidence and shared filters work at desktop and mobile widths', async ({
  page,
  request,
  context,
}) => {
  const response = await request.get('/api/v1/search?q=Casio');
  let catalog = await response.json();
  if (!catalog.products?.length)
    catalog = await (await request.get('/api/v1/search?q=Pixel')).json();
  const product = catalog.products[0];
  expect(product).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/p/${product.slug}?basis=item&days=7`, { waitUntil: 'domcontentloaded' });
  const basis = page.getByRole('combobox', { name: 'History price basis' });
  await expect(basis).toHaveValue('item');
  await expect(page.locator('.range-control button.selected')).toHaveText('7 days');
  await basis.selectOption('delivered');
  await expect(basis).toHaveValue('delivered');
  await basis.selectOption('item');
  const download = page.getByRole('button', { name: 'Export history CSV' });
  await expect(download).toBeEnabled();
  const pending = page.waitForEvent('download');
  await download.click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/7d-item\.csv$/);
  const stream = await file.createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('Recorded observation; verify at checkout');
  expect(csv).toContain(product.id);
  await page.getByRole('button', { name: 'Copy history view link' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(shared).searchParams.get('basis')).toBe('item');
  expect(new URL(shared).searchParams.get('days')).toBe('7');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual(
    [],
  );
  expect(errors).toEqual([]);
});
