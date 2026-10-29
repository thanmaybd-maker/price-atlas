import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('signed-in paper form confirms the saved target without blocking on a session refresh', async ({
  page,
}) => {
  const rules: Record<string, unknown>[] = [];
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'fixture-user', name: 'UI fixture', notifications: 1 },
        watches: [],
        rules,
        notifications: [],
        delivery: { emailAvailable: false },
      },
    }),
  );
  let posted: Record<string, unknown> | undefined;
  await page.route('**/api/v1/rules', async (route) => {
    posted = route.request().postDataJSON();
    const rule = {
      ...posted,
      id: 'fixture-rule',
      version: 1,
      episode: 0,
      activeEpisode: false,
      aboveCount: 0,
      lastTriggeredAt: null,
    };
    rules.push(rule);
    await route.fulfill({ status: 201, json: { rule } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Account settings', exact: true }).waitFor();
  const input = page.getByLabel('Alert me at or below', { exact: true });
  await input.fill('199.50');
  await page.locator('#targets').getByRole('button', { name: 'Pin it', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#targets .sheet .tg').first()).toHaveText('₹199.5');
  expect(posted?.target).toBe(19950);
  expect(posted?.basis).toBe('item');
  await page.locator('#targets').screenshot({ path: 'data/pinned-target-proof.png' });
  await page.getByRole('button', { name: 'Use Dark theme', exact: true }).click();
  const audit = await new AxeBuilder({ page })
    .include('#targets')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    audit.violations.filter((finding) => ['serious', 'critical'].includes(finding.impact || '')),
  ).toEqual([]);
});

test('an explicit guest pin survives a sign-in return and creates exactly one confirmed note', async ({
  page,
}) => {
  let signedIn = false,
    writes = 0;
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        user: signedIn ? { id: 'fixture-user', name: 'UI fixture', notifications: 1 } : null,
        watches: [],
        rules: [],
        notifications: [],
        delivery: { emailAvailable: false },
      },
    }),
  );
  await page.route('**/api/v1/rules', (route) => {
    writes++;
    return route.fulfill({
      status: 201,
      json: {
        rule: {
          ...route.request().postDataJSON(),
          id: 'fixture-return-rule',
          version: 1,
          episode: 0,
          activeEpisode: false,
          aboveCount: 0,
          lastTriggeredAt: null,
        },
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Alert me at or below', { exact: true }).fill('199.50');
  await page.locator('#targets').getByRole('button', { name: 'Pin it', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  signedIn = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#targets .sheet .tg').first()).toHaveText('₹199.5');
  expect(writes).toBe(1);
});

test('history read failure stays visible and retry restores real recorded rows', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/v1/history?**', async (route) => {
    if (fail)
      await route.fulfill({ status: 503, json: { error: 'History temporarily unavailable.' } });
    else await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('history-coverage')).toContainText(
    'History temporarily unavailable.',
  );
  fail = false;
  await page.getByRole('button', { name: 'Refresh recorded history' }).click();
  await expect(page.getByTestId('history-coverage')).toContainText('of 30 days have recorded', {
    timeout: 20000,
  });
  await page.getByText('View recorded daily prices', { exact: true }).click();
  await expect(page.locator('.tide-data tbody tr').first()).toBeVisible();
  await expect(page.locator('.ridge .recorded-point')).toHaveCount(
    await page.locator('.tide-data tbody tr').count(),
  );
  await page.locator('.hs .al').screenshot({ path: 'data/history-proof.png' });
});

test('all main surfaces fit mobile and retain serious-issue-free contrast in both themes', async ({
  page,
}) => {
  test.setTimeout(180000);
  const findings: unknown[] = [];
  await page.setViewportSize({ width: 360, height: 800 });
  for (const theme of ['light', 'dark']) {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.getByRole('combobox', { name: 'Color theme' }).selectOption(theme);
    for (const path of [
      '/',
      '/categories',
      '/search',
      '/p/amazon-b09xs7jwhh',
      '/watchlist',
      '/alerts',
      '/settings',
      '/compare',
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      if (path === '/') await page.getByRole('button', { name: 'Pin it', exact: true }).waitFor();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${theme} ${path}`,
      ).toBe(true);
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      for (const finding of audit.violations.filter((finding) =>
        ['serious', 'critical'].includes(finding.impact || ''),
      ))
        findings.push({
          theme,
          path,
          id: finding.id,
          nodes: finding.nodes.map((node) => ({
            target: node.target,
            failure: node.failureSummary,
          })),
        });
      if (path === '/')
        await page.screenshot({ path: `data/theme-${theme}-mobile.png`, fullPage: true });
    }
  }
  expect(findings).toEqual([]);
});

test('a guest pins from the paper form without visiting the old target dialog', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Alert me at or below', { exact: true }).fill('200');
  await page.locator('#targets').getByRole('button', { name: 'Pin it', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Name your price.', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Sign in');
  await expect(page.getByLabel('Alert me at or below', { exact: true })).toHaveValue('200');
});

test('appearance works before sign-in and changes the paper surfaces across routes', async ({
  page,
}) => {
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  await expect(theme).toBeVisible();
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await page.locator('.cs').evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('light');
  await page.goto('/categories', { waitUntil: 'domcontentloaded' });
  const light = await page
    .locator('.cs')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(light).not.toBe(dark);
});

test('Home exposes history basis, recorded coverage and table rather than a silent blank chart', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox', { name: 'Home history price basis' })).toHaveValue(
    'item',
  );
  await expect(page.getByTestId('history-coverage')).toContainText(/recorded|retry|loading/i);
  await expect(page.getByRole('button', { name: 'Refresh recorded history' })).toBeVisible();
});
