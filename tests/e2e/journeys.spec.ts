import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('search, product identity, and chart alternative', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('combobox', { name: 'Search products or paste a retailer link' })
    .fill('Pixel 9');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/search\?q=Pixel%209/);
  await page.getByRole('link', { name: 'Google Pixel 9', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Google Pixel 9', exact: true })).toBeVisible();
  await page.getByText('Why these offers match', { exact: true }).click();
  await expect(page.getByText('128 GB', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'View data table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Observed' })).toBeVisible();
  await expect(page.locator('body')).toContainText('Synthetic demo prices');
});

test('target survives profile creation, then persists across reload', async ({ page }) => {
  await page.goto('/p/google-pixel-9-128gb-obsidian');
  await page.getByRole('button', { name: 'Set a price target' }).click();
  await page.getByRole('spinbutton').fill('999999');
  await page.getByRole('button', { name: 'Continue with a demo profile' }).click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Browser verification');
  await page.getByRole('button', { name: 'Create demo profile', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save target', exact: true });
  await expect(save).toBeEnabled();
  await expect(page.getByRole('spinbutton')).toHaveValue('999999');
  await save.click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('/alerts');
  await expect(page.getByText('Your target price is here', { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByText('Your target price is here', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText('Your target price is here', { exact: true })).toHaveCount(1);
  await page.request.delete('/api/v1/account');
});

test('mobile width does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ['/', '/search', '/p/sony-wh-1000xm5-black', '/watchlist', '/alerts']) {
    await page.goto(path);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fits, path).toBe(true);
  }
});

test('home has no serious or critical automated accessibility findings', async ({ page }) => {
  await page.goto('/');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual(
    [],
  );
});
