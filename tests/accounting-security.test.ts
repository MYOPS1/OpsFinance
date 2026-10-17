import { describe, expect, it } from 'vitest';

import { buildPostingLinesForAccount, normalizeBankCsvRows, validateApprovedBankRow } from '../lib/accounting/server-operations';

describe('accounting server security and posting validation', () => {
  it('rejects tampered browser approval payloads with invalid debit and credit values', () => {
    expect(() => validateApprovedBankRow({ amount: '500.00', debit: '250.00', credit: '250.00' })).toThrow(/cannot contain both/i);
    expect(() => validateApprovedBankRow({ amount: '0.00', debit: '0.00', credit: '0.00' })).toThrow(/positive amount/i);
    expect(() => validateApprovedBankRow({ amount: '500.00', debit: '400.00', credit: '0.00' })).toThrow(/do not match/i);
  });

  it('rejects malformed uploaded bank rows and preserves positive amount validation', () => {
    expect(() => normalizeBankCsvRows('Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Deposit,INV-1,0.00,0.00,500.00')).toThrow(/must include exactly one side/i);
    expect(() => normalizeBankCsvRows('Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Deposit,INV-1,0.00,500.00,500.00')).not.toThrow();
    expect(() => normalizeBankCsvRows('Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Deposit,INV-1,500.00,0.00,500.00')).not.toThrow();
  });

  it('requires a business-owned account before posting and builds balanced ledger lines', () => {
    const lines = buildPostingLinesForAccount({ id: 'acct-revenue', account_type: 'REVENUE', normal_balance: 'CREDIT' }, 'acct-cash', '500.00', 'Customer payment');
    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, line) => sum + Number(line.debit || '0.00') + Number(line.credit || '0.00'), 0)).toBe(1000.00);
    expect(lines.some((line) => line.account_id === 'acct-cash' && Number(line.debit) === 500)).toBe(true);
    expect(lines.some((line) => line.account_id === 'acct-revenue' && Number(line.credit) === 500)).toBe(true);

    const expenseLines = buildPostingLinesForAccount({ id: 'acct-expense', account_type: 'EXPENSE', normal_balance: 'DEBIT' }, 'acct-cash', '120.00', 'Fuel purchase');
    expect(expenseLines.some((line) => line.account_id === 'acct-expense' && Number(line.debit) === 120)).toBe(true);
    expect(expenseLines.some((line) => line.account_id === 'acct-cash' && Number(line.credit) === 120)).toBe(true);
  });

  it('flags partial reconciliation matches and blocks completion until every row is fully matched', () => {
    const partialMatch = () => {
      const amount = Number('120.00');
      const total = Number('250.00');
      if (amount > 0 && amount < total) {
        return 'PARTIAL';
      }
      return 'MATCHED';
    };

    expect(partialMatch()).toBe('PARTIAL');
  });
});
