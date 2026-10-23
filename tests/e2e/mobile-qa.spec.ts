import { test, expect } from '@playwright/test';

const E2E_ENVIRONMENT = 'E2E TEST ENVIRONMENT';

async function authenticateWithUat(page: any) {
  const email = process.env.PLAYWRIGHT_UAT_EMAIL;
  const password = process.env.PLAYWRIGHT_UAT_PASSWORD;

  if (!email || !password) {
    throw new Error('PLAYWRIGHT_UAT_EMAIL and PLAYWRIGHT_UAT_PASSWORD must be set for protected-route E2E tests.');
  }

  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 });
  await expect(page.getByText(/Authenticated user:/)).toBeVisible();
}

test.describe(E2E_ENVIRONMENT, () => {
  test('mobile viewport renders critical authenticated flows without crashing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateWithUat(page);

    await page.goto('/');
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /OpsFinance Dashboard/i })).toBeVisible();
    await expect(page.getByText('Authentication foundation')).not.toBeVisible();

    await page.goto('/transactions');
    await page.locator('.opsfinance-mobile-toggle').click();
    await expect(page.getByRole('navigation', { name: 'OpsFinance navigation' }).getByRole('link', { name: 'All Transactions' })).toBeVisible();
    await page.goto('/upload');
    await expect(page.getByRole('heading', { name: 'Upload & Convert' })).toBeVisible();
    await page.goto('/settings/business');
    await expect(page.getByRole('heading', { name: /Business Profile/i })).toBeVisible();
  });
});
