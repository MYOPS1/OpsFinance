import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/preview/data/route';
import { PREVIEW_BUSINESS_ID } from '../lib/preview-data';

describe('Preview report data API', () => {
  beforeEach(() => {
    process.env.PREVIEW_AUTH_BYPASS = 'true';
    process.env.NEXT_PUBLIC_PREVIEW_AUTH_BYPASS = 'true';
  });

  it('returns the same posted-journal dataset used by the preview UI reports', async () => {
    const response = await GET();

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.previewContext.businessId).toBe(PREVIEW_BUSINESS_ID);
    expect(payload.snapshot.pnl.revenueTotal).toBe('12000.00');
    expect(payload.snapshot.pnl.expensesTotal).toBe('3850.00');
    expect(payload.snapshot.pnl.netProfit).toBe('8150.00');
    expect(payload.snapshot.trial.totalDebit).toBe('21850.00');
    expect(payload.snapshot.trial.totalCredit).toBe('21850.00');
    expect(payload.snapshot.trial.difference).toBe('0.00');
    expect(payload.snapshot.sheet.totalAssets).toBe('30150.00');
    expect(payload.snapshot.sheet.totalEquity).toBe('30150.00');
    expect(payload.snapshot.sheet.balanceDifference).toBe('0.00');

    const ledgerRows = payload.snapshot.ledger.rows;
    const bankRows = ledgerRows.filter((row: any) => row.accountName === 'Bank');
    const cashRows = ledgerRows.filter((row: any) => row.accountName === 'Cash');
    expect(bankRows.length).toBeGreaterThan(0);
    expect(cashRows.length).toBeGreaterThan(0);
    expect(payload.snapshot.statement.accountName).toBe('Cash');
    expect(payload.snapshot.statement.openingBalance).toBe('2000.00');
    expect(payload.snapshot.statement.closingBalance).toBe('3000.00');
  });
});
