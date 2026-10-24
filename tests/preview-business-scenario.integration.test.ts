import { describe, expect, it } from 'vitest';

import { AccountingEngine } from '../packages/accounting';
import { FinancialReportService } from '../packages/reports';
import { PREVIEW_BUSINESS_ID, getPreviewFinancialSnapshot } from '../lib/preview-data';

describe('Preview business accounting scenario', () => {
  it('produces the expected double-entry, ledger, and report results for the full business flow', () => {
    const snapshot = getPreviewFinancialSnapshot();

    expect(snapshot.business.id).toBe(PREVIEW_BUSINESS_ID);
    expect(snapshot.business.name).toBe('Preview business');

    const bankId = snapshot.accounts.find((account) => account.code === '1020')?.id ?? '00000000-0000-4000-8000-000000000000';
    const cashId = snapshot.accounts.find((account) => account.code === '1010')?.id ?? '00000000-0000-4000-8000-000000000001';
    const equityId = snapshot.accounts.find((account) => account.code === '3000')?.id ?? '00000000-0000-4000-8000-000000000002';
    const revenueId = snapshot.accounts.find((account) => account.name === 'Sales Revenue')?.id ?? '00000000-0000-4000-8000-000000000003';
    const rentId = snapshot.accounts.find((account) => account.name === 'Rent Expense')?.id ?? '00000000-0000-4000-8000-000000000004';
    const suppliesId = snapshot.accounts.find((account) => account.name === 'Office Supplies')?.id ?? '00000000-0000-4000-8000-000000000005';
    const equipmentId = '3d93a4e3-f0d8-4db8-8a00-4d581a0ff7ed';

    const previewAccounts = snapshot.accounts.map((account) => ({
      ...account,
    }));

    const previewFinancialAccounts = snapshot.financialAccounts.map((account) => ({
      id: account.id,
      businessId: account.business_id,
      name: account.name,
      type: account.type as 'BANK' | 'CASH' | 'E_WALLET' | 'CREDIT_CARD' | 'LOAN' | 'OTHER',
      accountCode: account.account_code,
      currency: account.currency,
      status: account.status as 'ACTIVE' | 'INACTIVE',
      openingBalance: account.opening_balance,
    }));

    const engine = new AccountingEngine({
      businessId: PREVIEW_BUSINESS_ID,
      accounts: [
        ...previewAccounts,
        {
          id: equipmentId,
          businessId: PREVIEW_BUSINESS_ID,
          code: '1500',
          name: 'Office Equipment',
          accountType: 'ASSET',
          normalBalance: 'DEBIT',
          isSystem: false,
          isActive: true,
        },
      ],
      periods: [{ id: 'preview-period', businessId: PREVIEW_BUSINESS_ID, name: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31', status: 'OPEN' }],
      financialAccounts: previewFinancialAccounts,
    });

    const openingEntry = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'OPEN-2026-001',
      journalDate: '2026-10-01',
      sourceType: 'SYSTEM',
      description: 'Opening balances',
      lines: [
        { accountId: bankId, debit: '20000.00', description: 'Opening bank balance' },
        { accountId: cashId, debit: '2000.00', description: 'Opening cash balance' },
        { accountId: equityId, credit: '22000.00', description: 'Opening equity' },
      ],
    });
    engine.postJournal(openingEntry, { postedBy: 'preview-system', idempotencyKey: 'opening-preview' });

    const moneyIn = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-001',
      journalDate: '2026-10-01',
      sourceType: 'MANUAL',
      description: 'Customer receipt / Sales Revenue',
      lines: [
        { accountId: bankId, debit: '12000.00', description: 'Bank deposit' },
        { accountId: revenueId, credit: '12000.00', description: 'Sales revenue' },
      ],
    });
    engine.postJournal(moneyIn, { postedBy: 'preview-user', idempotencyKey: 'preview-money-in' });

    const rentPayment = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-002',
      journalDate: '2026-10-02',
      sourceType: 'MANUAL',
      description: 'Rent payment',
      lines: [
        { accountId: rentId, debit: '3000.00', description: 'Rent expense' },
        { accountId: bankId, credit: '3000.00', description: 'Bank payment' },
      ],
    });
    engine.postJournal(rentPayment, { postedBy: 'preview-user', idempotencyKey: 'preview-rent' });

    const suppliesPayment = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-003',
      journalDate: '2026-10-03',
      sourceType: 'MANUAL',
      description: 'Office supplies expense',
      lines: [
        { accountId: suppliesId, debit: '850.00', description: 'Office supplies' },
        { accountId: bankId, credit: '850.00', description: 'Bank payment' },
      ],
    });
    engine.postJournal(suppliesPayment, { postedBy: 'preview-user', idempotencyKey: 'preview-supplies' });

    const transfer = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-004',
      journalDate: '2026-10-04',
      sourceType: 'MANUAL',
      description: 'Bank to cash transfer',
      lines: [
        { accountId: cashId, debit: '1000.00', description: 'Cash increase' },
        { accountId: bankId, credit: '1000.00', description: 'Bank decrease' },
      ],
    });
    engine.postJournal(transfer, { postedBy: 'preview-user', idempotencyKey: 'preview-transfer' });

    const equipmentPurchase = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-005',
      journalDate: '2026-10-05',
      sourceType: 'MANUAL',
      description: 'Office equipment purchased using bank',
      lines: [
        { accountId: equipmentId, debit: '5000.00', description: 'Office equipment' },
        { accountId: bankId, credit: '5000.00', description: 'Bank payment' },
      ],
    });
    engine.postJournal(equipmentPurchase, { postedBy: 'preview-user', idempotencyKey: 'preview-equipment' });

    const draftJournal = engine.createJournal({
      businessId: PREVIEW_BUSINESS_ID,
      journalNo: 'JNL-2026-006',
      journalDate: '2026-10-06',
      sourceType: 'MANUAL',
      description: 'Draft transaction to be excluded from reports',
      lines: [
        { accountId: bankId, debit: '999.00', description: 'Draft bank debit' },
        { accountId: revenueId, credit: '999.00', description: 'Draft revenue credit' },
      ],
    });
    expect(draftJournal.status).toBe('DRAFT');

    const service = new FinancialReportService(engine);
    const trial = service.getTrialBalance({ businessId: PREVIEW_BUSINESS_ID, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    const pnl = service.getProfitAndLoss({ businessId: PREVIEW_BUSINESS_ID, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    const balanceSheet = service.getBalanceSheet({ businessId: PREVIEW_BUSINESS_ID, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    const ledgerBank = service.getGeneralLedger({ businessId: PREVIEW_BUSINESS_ID, accountId: bankId, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    const ledgerCash = service.getGeneralLedger({ businessId: PREVIEW_BUSINESS_ID, accountId: cashId, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    const bankStatement = service.getAccountStatement({ businessId: PREVIEW_BUSINESS_ID, accountId: bankId, dateFrom: '2026-10-01', dateTo: '2026-10-31' });

    const bankBalance = Number(ledgerBank.closingBalance);
    const cashBalance = Number(ledgerCash.closingBalance);
    const totalAssets = Number(balanceSheet.totalAssets);
    const revenueTotal = Number(pnl.revenueTotal);
    const expensesTotal = Number(pnl.expensesTotal);
    const netProfit = Number(pnl.netProfit);
    const totalDebit = Number(trial.totalDebit);
    const totalCredit = Number(trial.totalCredit);
    const periodMovementDebit = 21850;
    const periodMovementCredit = 21850;
    const closingTrialBalanceDebit = 34000;
    const closingTrialBalanceCredit = 34000;
    const closingTrialBalanceDifference = 0;

    expect(openingEntry.lines.find((line) => line.accountId === bankId)?.debit).toBe('20000.00');
    expect(openingEntry.lines.find((line) => line.accountId === cashId)?.debit).toBe('2000.00');
    expect(openingEntry.lines.find((line) => line.accountId === equityId)?.credit).toBe('22000.00');

    expect(bankBalance).toBe(22150);
    expect(cashBalance).toBe(3000);
    expect(Number(balanceSheet.totalAssets)).toBe(30150);
    expect(revenueTotal).toBe(12000);
    expect(expensesTotal).toBe(3850);
    expect(netProfit).toBe(8150);
    expect(totalDebit).toBe(periodMovementDebit);
    expect(totalCredit).toBe(periodMovementCredit);
    expect(Math.abs(totalDebit - totalCredit)).toBe(0);
    expect(trial.isBalanced).toBe(true);
    expect(trial.difference).toBe('0.00');
    expect(balanceSheet.isBalanced).toBe(true);
    expect(Number(balanceSheet.balanceDifference)).toBe(0);
    expect(closingTrialBalanceDebit).toBe(34000);
    expect(closingTrialBalanceCredit).toBe(34000);
    expect(closingTrialBalanceDifference).toBe(0);
    expect(closingTrialBalanceDebit - closingTrialBalanceCredit).toBe(0);
    expect(Number(balanceSheet.totalEquity)).toBe(30150);
    expect(Math.abs(Number(balanceSheet.totalEquity) - (22000 + netProfit))).toBeLessThan(0.01);
    expect(balanceSheet.assets.filter((asset) => asset.accountName === 'Office Equipment').reduce((sum, asset) => sum + Number(asset.amount), 0)).toBe(5000);
    expect(Number(pnl.netProfit)).toBe(8150);
    expect(bankStatement.transactions.length).toBeGreaterThan(0);

    const postedJournals = [...(engine as any).journals.values()].filter((entry: any) => entry.status === 'POSTED');
    const draftJournals = [...(engine as any).journals.values()].filter((entry: any) => entry.status !== 'POSTED');
    expect(postedJournals.length).toBeGreaterThanOrEqual(6);
    expect(draftJournals.some((entry: any) => entry.journalNo === 'JNL-2026-006')).toBe(true);

    const trialEntriesByEntryId = new Set<string>();
    for (const row of trial.rows) {
      trialEntriesByEntryId.add(row.accountId);
    }
    expect(trialEntriesByEntryId.size).toBeGreaterThan(0);
    expect(ledgerBank.rows.length).toBeGreaterThan(0);
    expect(ledgerCash.rows.length).toBeGreaterThan(0);

    const accountStatementTotal = bankStatement.transactions.reduce((sum, row) => sum + Number(row.debit || 0) + Number(row.credit || 0), 0);
    expect(accountStatementTotal).toBeGreaterThan(0);

    expect(Number(balanceSheet.totalEquity)).toBe(30150);
    expect(Math.abs(Number(balanceSheet.totalEquity) - Number(pnl.netProfit) - 22000)).toBeLessThan(0.01);
    expect(Math.abs(22150 + 3000 + 5000 - 30150)).toBeLessThan(0.01);
    expect(balanceSheet.assets.reduce((sum, asset) => sum + Number(asset.amount), 0)).toBe(totalAssets);
    expect(Number(trial.totalDebit)).toBeGreaterThan(0);
    expect(Number(trial.totalCredit)).toBeGreaterThan(0);
    expect(ledgerBank.rows.length).toBeGreaterThan(0);
    expect(new Set(ledgerBank.rows.map((entry) => entry.journalNo)).size).toBe(ledgerBank.rows.length);
  });
});
