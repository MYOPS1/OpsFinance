import { test, expect } from '@playwright/test';

const E2E_ENVIRONMENT = 'E2E TEST ENVIRONMENT';

async function authenticateWithUat(page: any) {
  const email = process.env.PLAYWRIGHT_UAT_EMAIL;
  const password = process.env.PLAYWRIGHT_UAT_PASSWORD;

  if (!email || !password) {
    throw new Error('PLAYWRIGHT_UAT_EMAIL and PLAYWRIGHT_UAT_PASSWORD must be set for protected-route E2E tests.');
  }

  await page.goto('/login', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await expect(page.getByText(/Authenticated user:/)).toBeVisible();
}

test.describe(E2E_ENVIRONMENT, () => {
  test('root route redirects to login and the login screen renders', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('authenticated root redirects to dashboard and protected settings flows remain accessible', async ({ page }) => {
    await authenticateWithUat(page);

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /OpsFinance Dashboard/i })).toBeVisible();
    await expect(page.getByText('Authentication foundation')).not.toBeVisible();

    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.goto('/settings/business', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Business Profile/i })).toBeVisible();

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.getByRole('banner').getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('money in, money out, transfer, upload, reconciliation, and reports screens load', async ({ page }) => {
    await authenticateWithUat(page);

    await page.goto('/transactions', { waitUntil: 'networkidle' });
    const mobileToggle = page.locator('.opsfinance-mobile-toggle');
    if (await mobileToggle.isVisible().catch(() => false)) {
      await mobileToggle.click();
    }
    await expect(page.getByRole('navigation', { name: 'OpsFinance navigation' }).getByRole('link', { name: 'All Transactions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Money In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Money Out', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible();

    await page.goto('/upload', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Upload & Convert' })).toBeVisible();
    await expect(page.getByText('Parse & review')).toBeVisible();

    await page.goto('/reconciliation', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Bank Reconciliation' })).toBeVisible();

    await page.goto('/reports', { waitUntil: 'networkidle' });
    await expect(page.getByRole('main').getByText('General Ledger')).toBeVisible();
  });
});
