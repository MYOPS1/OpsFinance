import { expect, test } from '@playwright/test';

const BANK_CSV = `Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-15,Bank charge,CHG-201,10.00,,4990.00`;

const INVALID_CSV = `Date,Description
2026-09-12,Missing amount`;

test.describe('OpsFinance upload and reconciliation workflows', () => {
  test('uploads a CSV, approves and posts a transaction', async ({ page }) => {
    await page.goto('/upload', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Upload & Convert' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'bank-upload.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(BANK_CSV),
    });

    await expect(page.getByText(/Imported 2 rows from bank-upload.csv/i)).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Approved Customer payment/i)).toBeVisible();
    await page.getByRole('button', { name: 'Post to ledger' }).click();
    await expect(page.getByText(/Posted Customer payment to the ledger/i)).toBeVisible();
  });

  test('rejects malformed uploads with a validation error', async ({ page }) => {
    await page.goto('/upload', { waitUntil: 'networkidle' });
    await page.locator('textarea').fill(INVALID_CSV);
    await page.getByRole('button', { name: 'Parse & review' }).click();

    await expect(page.locator('[role="alert"]').filter({ hasText: /Only CSV bank statements|validation|error/i })).toBeVisible();
  });

  test('imports a reconciliation statement and finalizes the match', async ({ page }) => {
    await page.goto('/reconciliation', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Bank Reconciliation' })).toBeVisible();

    await page.locator('textarea').fill(`Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-15,Bank charge,CHG-201,10.00,,4990.00
2026-09-16,Petrol purchase,PO-2041,120.00,,4870.00`);
    await page.getByRole('button', { name: 'Import statement' }).click();
    await page.waitForTimeout(500);

    const matchPairs = [
      ['Customer payment — 500.00', 'Customer payment — 500.00'],
      ['Bank charge — 10.00', 'Bank charge — 10.00'],
      ['Petrol purchase — 120.00', 'Petrol purchase — 120.00'],
    ];

    for (const [bankLabel, bookLabel] of matchPairs) {
      await page.locator('select').nth(0).selectOption({ label: bankLabel });
      await page.locator('select').nth(1).selectOption({ label: bookLabel });
      await page.getByRole('button', { name: 'Match selected' }).click();
      await page.waitForTimeout(300);
    }

    await page.getByRole('button', { name: 'Finalize reconciliation' }).click();
    await expect(page.getByText(/Reconciliation finalized/i)).toBeVisible();
    await expect(page.getByText(/Difference:/i)).toBeVisible();
  });
});
