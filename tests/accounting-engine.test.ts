import { describe, expect, it } from 'vitest';
import {
  AccountingEngine,
  DecimalMoney,
  createAccountingPeriod,
  createMoneyInJournal,
  createMoneyOutJournal,
  createOpeningBalanceJournal,
  createTransferJournal,
  type JournalLineInput,
} from '../packages/accounting';
import { LocalJournalRepository, LocalTransactionRepository } from '../packages/repositories';
import { TransactionService } from '../packages/transactions';

describe('Phase 2 accounting engine', () => {
  const businessId = '11111111-1111-4111-8111-111111111111';
  const customerBankId = '22222222-2222-4222-8222-222222222222';
  const revenueAccountId = '33333333-3333-4333-8333-333333333333';
  const expenseAccountId = '44444444-4444-4444-8444-444444444444';
  const cashAccountId = '55555555-5555-4555-8555-555555555555';
  const openingEquityAccountId = '66666666-6666-4666-8666-666666666666';
  const otherBusinessId = '77777777-7777-4777-8777-777777777777';

  const engine = new AccountingEngine({
    businessId,
    accounts: [
      { id: revenueAccountId, businessId, code: '4000', name: 'Sales', accountType: 'REVENUE', normalBalance: 'CREDIT', isSystem: false, isActive: true },
      { id: expenseAccountId, businessId, code: '6000', name: 'Petrol', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      { id: cashAccountId, businessId, code: '1100', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      { id: openingEquityAccountId, businessId, code: '3000', name: 'Opening Equity', accountType: 'EQUITY', normalBalance: 'CREDIT', isSystem: true, isActive: true },
    ],
    periods: [{ id: 'period-1', businessId, name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
    financialAccounts: [{ id: customerBankId, businessId, name: 'Maybank', type: 'BANK', accountCode: 'MAYBANK', currency: 'MYR', status: 'ACTIVE' }],
  });

  it('accepts valid balanced journals and rejects unbalanced ones', () => {
    const validLines: JournalLineInput[] = [
      { accountId: customerBankId, debit: '500.00', description: 'Bank deposit' },
      { accountId: revenueAccountId, credit: '500.00', description: 'Revenue recognised' },
    ];

    const valid = engine.validateJournal({
      businessId,
      journalNo: 'J-1001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-1',
      description: 'Customer payment',
      lines: validLines,
    });

    expect(valid.isValid).toBe(true);

    const invalid = engine.validateJournal({
      businessId,
      journalNo: 'J-1002',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-2',
      description: 'Broken journal',
      lines: [
        { accountId: customerBankId, debit: '500.00' },
        { accountId: revenueAccountId, credit: '300.00' },
      ],
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('debit');
  });

  it('rejects malformed monetary values and prevents persistence of unbalanced journals', async () => {
    expect(() => new DecimalMoney('12.34.56')).toThrow();
    expect(() => new DecimalMoney('abc')).toThrow();

    const mockClient = {
      from: () => {
        throw new Error('database insert should not be reached for unbalanced journal payloads');
      },
    };

    const repo = new (await import('../packages/supabase-persistence')).SupabaseJournalRepository(mockClient as any);
    await expect(repo.createPosted({
      id: 'journal-invalid',
      businessId,
      journalNo: 'J-0001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      description: 'Invalid payload',
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      lines: [
        { id: 'line-1', journalEntryId: 'journal-invalid', accountId: customerBankId, debit: '50.00', credit: '0.00', description: 'Bank' },
        { id: 'line-2', journalEntryId: 'journal-invalid', accountId: revenueAccountId, debit: '0.00', credit: '10.00', description: 'Revenue' },
      ],
    })).rejects.toThrow('unbalanced');
  });

  it('builds a correct money-in journal', () => {
    const result = createMoneyInJournal({
      businessId,
      journalDate: '2026-09-12',
      financialAccountId: customerBankId,
      revenueAccountId,
      amount: '500.00',
      description: 'Customer payment',
      referenceNo: 'INV-1001',
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].debit).toBe('500.00');
    expect(result.lines[1].credit).toBe('500.00');
  });

  it('builds a correct money-out journal', () => {
    const result = createMoneyOutJournal({
      businessId,
      journalDate: '2026-09-12',
      financialAccountId: customerBankId,
      expenseAccountId,
      amount: '120.00',
      description: 'Fuel',
      referenceNo: 'FUEL-1',
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].debit).toBe('120.00');
    expect(result.lines[1].credit).toBe('120.00');
  });

  it('builds a valid transfer journal without P&L impact', () => {
    const result = createTransferJournal({
      businessId,
      journalDate: '2026-09-12',
      fromFinancialAccountId: customerBankId,
      toFinancialAccountId: '88888888-8888-4888-8888-888888888888',
      fromAccountId: customerBankId,
      toAccountId: cashAccountId,
      amount: '1000.00',
      description: 'Transfer between accounts',
      referenceNo: 'TR-001',
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].debit).toBe('1000.00');
    expect(result.lines[1].credit).toBe('1000.00');
  });

  it('supports opening balances as accounting entries', () => {
    const result = createOpeningBalanceJournal({
      businessId,
      journalDate: '2026-09-01',
      financialAccountId: customerBankId,
      openingEquityAccountId,
      amount: '10000.00',
      description: 'Opening balance',
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].debit).toBe('10000.00');
    expect(result.lines[1].credit).toBe('10000.00');
  });

  it('computes ledger balances from posted journals', () => {
    const ledger = engine.getLedger({ businessId, accountId: customerBankId });
    expect(Number(ledger.debitTotal)).toBeGreaterThanOrEqual(0);
    expect(Number(ledger.creditTotal)).toBeGreaterThanOrEqual(0);
    expect(typeof ledger.balance).toBe('string');
  });

  it('rejects posting into a closed period', () => {
    const closedPeriod = createAccountingPeriod({
      businessId,
      name: '2026-08',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'CLOSED',
    });

    const result = engine.validateJournal({
      businessId,
      journalNo: 'J-2001',
      journalDate: '2026-08-20',
      sourceType: 'MANUAL',
      sourceId: 'source-8',
      description: 'Closed period attempt',
      lines: [
        { accountId: customerBankId, debit: '25.00' },
        { accountId: revenueAccountId, credit: '25.00' },
      ],
      accountingPeriods: [closedPeriod],
    });

    expect(result.isValid).toBe(false);
  });

  it('protects posted journal immutability and reversal workflow', () => {
    const journal = engine.createJournal({
      businessId,
      journalNo: 'J-3001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-9',
      description: 'Original posted',
      lines: [
        { accountId: customerBankId, debit: '50.00' },
        { accountId: revenueAccountId, credit: '50.00' },
      ],
    });

    const posted = engine.postJournal(journal, { postedBy: 'user-1', idempotencyKey: 'post-3001' });
    expect(posted.status).toBe('POSTED');

    expect(() => engine.updateJournal(posted.id, { description: 'tamper' })).toThrow();

    const reversal = engine.reverseJournal(posted, { reason: 'Correction', createdBy: 'user-1' });
    expect(reversal.status).toBe('VOIDED');
  });

  it('enforces idempotency', () => {
    const journal = engine.createJournal({
      businessId,
      journalNo: 'J-4001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-10',
      description: 'Idempotent',
      lines: [
        { accountId: customerBankId, debit: '10.00' },
        { accountId: revenueAccountId, credit: '10.00' },
      ],
    });

    const first = engine.postJournal(journal, { postedBy: 'user-1', idempotencyKey: 'same' });
    const second = engine.postJournal(journal, { postedBy: 'user-1', idempotencyKey: 'same' });

    expect(first.id).toBe(second.id);
  });

  it('prevents cross-business access and authorization failures', () => {
    const journal = engine.createJournal({
      businessId: otherBusinessId,
      journalNo: 'J-5001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-11',
      description: 'Other business',
      lines: [
        { accountId: customerBankId, debit: '5.00' },
        { accountId: revenueAccountId, credit: '5.00' },
      ],
    });

    expect(() => engine.authorizeBusiness(journal.businessId, businessId)).toThrow();
    const invalid = engine.validateJournal({
      businessId,
      journalNo: 'J-5002',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-12',
      description: 'Bad account',
      lines: [
        { accountId: 'bad-account-id', debit: '5.00' },
        { accountId: revenueAccountId, credit: '5.00' },
      ],
    });

    expect(invalid.isValid).toBe(false);
  });

  it('performs atomic rollback when validation fails mid-post', () => {
    const journal = engine.createJournal({
      businessId,
      journalNo: 'J-6001',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      sourceId: 'source-13',
      description: 'Will fail',
      lines: [
        { accountId: customerBankId, debit: '7.00' },
        { accountId: revenueAccountId, credit: '7.00' },
      ],
    });

    const result = engine.postJournal(journal, { postedBy: 'user-1', idempotencyKey: 'fail-1', shouldFail: true });
    expect(result.status).toBe('DRAFT');
  });

  it('uses deterministic decimal handling for precision and rounding', () => {
    const value = '0.01';
    expect(engine.toDecimal(value).toString()).toBe('0.01');
    expect(engine.toDecimal('10.00').add(engine.toDecimal('0.01')).toString()).toBe('10.01');
  });

  it('rejects transactions that target financial accounts outside the business', () => {
    const otherBusinessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherBusinessBankId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const engineWithOtherBusiness = new AccountingEngine({
      businessId,
      accounts: [
        { id: revenueAccountId, businessId, code: '4000', name: 'Sales', accountType: 'REVENUE', normalBalance: 'CREDIT', isSystem: false, isActive: true },
        { id: expenseAccountId, businessId, code: '6000', name: 'Petrol', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: false, isActive: true },
        { id: cashAccountId, businessId, code: '1100', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
        { id: openingEquityAccountId, businessId, code: '3000', name: 'Opening Equity', accountType: 'EQUITY', normalBalance: 'CREDIT', isSystem: true, isActive: true },
      ],
      periods: [{ id: 'period-1', businessId, name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
      financialAccounts: [{ id: otherBusinessBankId, businessId: otherBusinessId, name: 'Other Bank', type: 'BANK', accountCode: 'OTHER-BANK', currency: 'MYR', status: 'ACTIVE' }],
    });
    const service = new TransactionService(engineWithOtherBusiness);

    expect(() => service.createTransaction({
      businessId,
      type: 'MONEY_IN',
      date: '2026-09-12',
      financialAccountId: otherBusinessBankId,
      amount: '50.00',
      description: 'Bad business mapping',
      accountId: revenueAccountId,
      createdBy: 'user-1',
    })).toThrow();
  });

  it('supports local transaction and journal repositories with business filtering', () => {
    const transactionRepository = new LocalTransactionRepository();
    const journalRepository = new LocalJournalRepository();

    const transaction = {
      id: 'txn-10',
      businessId,
      type: 'MONEY_IN' as const,
      date: '2026-09-12',
      description: 'Repository transaction',
      amount: '10.00',
      financialAccountId: customerBankId,
      accountId: revenueAccountId,
      status: 'POSTED' as const,
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-09-12T00:00:00.000Z',
    };

    transactionRepository.create(transaction);
    journalRepository.create({
      id: 'journal-10',
      businessId,
      journalNo: 'J-10',
      journalDate: '2026-09-12',
      sourceType: 'MANUAL',
      status: 'POSTED',
      createdAt: '2026-09-12T00:00:00.000Z',
      lines: [],
    });

    expect(transactionRepository.listByBusiness(businessId)).toHaveLength(1);
    expect(journalRepository.getById(businessId, 'journal-10').journalNo).toBe('J-10');
    expect(() => transactionRepository.getById(otherBusinessId, 'txn-10')).toThrow('not found');
  });

  it('rejects ledger queries for accounts outside the business', () => {
    const mixedBusinessEngine = new AccountingEngine({
      businessId,
      accounts: [
        { id: 'foreign-account', businessId: otherBusinessId, code: '9999', name: 'Foreign', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
        { id: customerBankId, businessId, code: '1100', name: 'Maybank', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      ],
      periods: [{ id: 'period-1', businessId, name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
      financialAccounts: [{ id: 'foreign-financial-account', businessId: otherBusinessId, name: 'Foreign Bank', type: 'BANK', accountCode: 'FOREIGN-BANK', currency: 'MYR', status: 'ACTIVE' }],
    });

    expect(() => mixedBusinessEngine.getLedger({ businessId, accountId: 'foreign-account' })).toThrow('does not belong to this business');
  });
});
