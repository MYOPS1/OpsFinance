import {
  AccountingEngine,
  createMoneyInJournal,
  createMoneyOutJournal,
  createTransferJournal,
  type JournalEntry,
  type JournalInput,
  type JournalLineInput,
} from './accounting';
import type { SubscriptionService } from './subscriptions';

export type TransactionType = 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'JOURNAL';
export type TransactionStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'POSTED' | 'VOIDED';

export interface TransactionAuditEvent {
  businessId: string;
  actor: string;
  action: string;
  entityType: 'TRANSACTION' | 'JOURNAL';
  entityId: string;
  timestamp: string;
  details?: string;
}

export interface TransactionValidationResult {
  isValid: boolean;
  errors: string[];
  totalDebit: string;
  totalCredit: string;
}

export interface TransactionLineInput {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string;
}

export interface TransactionCreateInput {
  businessId: string;
  type: TransactionType;
  date: string;
  description: string;
  amount?: string;
  referenceNo?: string;
  financialAccountId?: string;
  accountId?: string;
  fromFinancialAccountId?: string;
  toFinancialAccountId?: string;
  createdBy?: string;
  lines?: TransactionLineInput[];
  idempotencyKey?: string;
}

export interface TransactionRecord {
  id: string;
  businessId: string;
  type: TransactionType;
  date: string;
  description: string;
  referenceNo?: string;
  amount: string;
  financialAccountId?: string;
  accountId?: string;
  fromFinancialAccountId?: string;
  toFinancialAccountId?: string;
  status: TransactionStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  journalId?: string;
  journal?: JournalEntry;
  lines?: TransactionLineInput[];
  auditTrail?: TransactionAuditEvent[];
}

export interface IdempotencyStoreLike {
  has: (key: string) => boolean;
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

export class MapIdempotencyStore implements IdempotencyStoreLike {
  private readonly map = new Map<string, string>();

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }
}

export class TransactionService {
  private readonly engine: AccountingEngine;
  private readonly transactions = new Map<string, TransactionRecord>();
  private readonly idempotency: IdempotencyStoreLike;

  constructor(
    engine: AccountingEngine,
    options: { subscriptionService?: SubscriptionService; idempotencyStore?: IdempotencyStoreLike } = {},
  ) {
    this.engine = engine;
    this.idempotency = options.idempotencyStore ?? new MapIdempotencyStore();
  }

  private getBusinessAccounts(): Map<string, any> {
    return (this.engine as any).accounts as Map<string, any>;
  }

  private getBusinessFinancialAccounts(): Map<string, any> {
    return (this.engine as any).financialAccounts as Map<string, any>;
  }

  private assertBusinessOwnedAccount(businessId: string, accountId: string | undefined, label: string): void {
    if (!accountId) {
      return;
    }

    const account = this.getBusinessAccounts().get(accountId);
    if (!account) {
      throw new Error(`${label} does not exist.`);
    }

    if (account.businessId !== businessId) {
      throw new Error(`${label} does not belong to this business.`);
    }
  }

  private assertBusinessOwnedFinancialAccount(
    businessId: string,
    financialAccountId: string | undefined,
    label = 'Financial account',
    allowChartAccount = false,
  ): void {
    if (!financialAccountId) {
      return;
    }

    const account = this.getBusinessFinancialAccounts().get(financialAccountId);
    if (account) {
      if (account.businessId !== businessId) {
        throw new Error(`${label} does not belong to this business.`);
      }
      if (account.status === 'INACTIVE') {
        throw new Error(`${label} is inactive.`);
      }
      return;
    }

    if (!allowChartAccount) {
      throw new Error(`${label} does not exist.`);
    }

    const coaAccount = this.getBusinessAccounts().get(financialAccountId);
    if (!coaAccount) {
      throw new Error(`${label} does not exist.`);
    }

    if (coaAccount.businessId !== businessId) {
      throw new Error(`${label} does not belong to this business.`);
    }

    if (coaAccount.isActive === false) {
      throw new Error(`${label} is inactive.`);
    }
  }

  getTransactions(businessId: string, actor?: string): TransactionRecord[] {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    return [...this.transactions.values()].filter((transaction) => transaction.businessId === businessId);
  }

  getTransaction(id: string): TransactionRecord {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error('Transaction not found.');
    }
    return transaction;
  }

  getAuditTrail(transactionId: string): TransactionAuditEvent[] {
    const transaction = this.getTransaction(transactionId);
    return transaction.auditTrail ?? [];
  }

  private addAuditEvent(transaction: TransactionRecord, action: string, actor: string, details?: string): TransactionRecord {
    const auditTrail: TransactionAuditEvent[] = [
      ...(transaction.auditTrail ?? []),
      {
        businessId: transaction.businessId,
        actor,
        action,
        entityType: 'TRANSACTION',
        entityId: transaction.id,
        timestamp: new Date().toISOString(),
        details,
      },
    ];

    return {
      ...transaction,
      auditTrail,
      updatedAt: new Date().toISOString(),
    };
  }

  validateTransaction(input: TransactionRecord | TransactionCreateInput): TransactionValidationResult {
    const transaction = 'status' in input ? input : {
      businessId: input.businessId,
      type: input.type,
      date: input.date,
      description: input.description,
      amount: input.amount ?? '0.00',
      referenceNo: input.referenceNo,
      financialAccountId: input.financialAccountId,
      accountId: input.accountId,
      fromFinancialAccountId: input.fromFinancialAccountId,
      toFinancialAccountId: input.toFinancialAccountId,
      lines: input.lines ?? [],
      status: 'DRAFT' as TransactionStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      id: 'validation-tx',
    };

    const errors: string[] = [];
    const amountValue = Number(transaction.amount ?? '0.00');

    if (!transaction.businessId) {
      errors.push('Business is required.');
    }
    if (!transaction.date) {
      errors.push('Transaction date is required.');
    }
    if (!transaction.description?.trim()) {
      errors.push('Transaction description is required.');
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.push('Transaction amount must be a positive number.');
    }

    try {
      this.engine.authorizeBusiness(transaction.businessId, this.engine.businessId);
    } catch {
      errors.push('Business authorization failed.');
    }

    if (transaction.type === 'MONEY_IN') {
      if (!transaction.financialAccountId) {
        errors.push('Money In requires a financial account.');
      }
      if (!transaction.accountId) {
        errors.push('Money In requires a revenue account.');
      }
      try {
        this.assertBusinessOwnedFinancialAccount(transaction.businessId, transaction.financialAccountId, 'Financial account');
      } catch (error) {
        errors.push((error as Error).message);
      }
      try {
        this.assertBusinessOwnedAccount(transaction.businessId, transaction.accountId, 'Revenue account');
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    if (transaction.type === 'MONEY_OUT') {
      if (!transaction.financialAccountId) {
        errors.push('Money Out requires a financial account.');
      }
      if (!transaction.accountId) {
        errors.push('Money Out requires an expense account.');
      }
      try {
        this.assertBusinessOwnedFinancialAccount(transaction.businessId, transaction.financialAccountId, 'Financial account');
      } catch (error) {
        errors.push((error as Error).message);
      }
      try {
        this.assertBusinessOwnedAccount(transaction.businessId, transaction.accountId, 'Expense account');
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    if (transaction.type === 'TRANSFER') {
      if (!transaction.fromFinancialAccountId || !transaction.toFinancialAccountId) {
        errors.push('Transfer requires source and destination financial accounts.');
      }
      if (transaction.fromFinancialAccountId && transaction.toFinancialAccountId && transaction.fromFinancialAccountId === transaction.toFinancialAccountId) {
        errors.push('Source and destination accounts cannot be the same.');
      }
      try {
        this.assertBusinessOwnedFinancialAccount(transaction.businessId, transaction.fromFinancialAccountId, 'Source financial account', true);
      } catch (error) {
        errors.push((error as Error).message);
      }
      try {
        this.assertBusinessOwnedFinancialAccount(transaction.businessId, transaction.toFinancialAccountId, 'Destination financial account', true);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    if (transaction.type === 'JOURNAL') {
      const lines = transaction.lines ?? [];
      if (lines.length < 2) {
        errors.push('Journal entries require at least two lines.');
      }
      if (lines.some((line) => !line.accountId)) {
        errors.push('Journal line account is required.');
      }
      if (lines.some((line) => Number(line.debit ?? '0') <= 0 && Number(line.credit ?? '0') <= 0)) {
        errors.push('Each journal line must have a positive debit or credit amount.');
      }
      if (lines.some((line) => Number(line.debit ?? '0') > 0 && Number(line.credit ?? '0') > 0)) {
        errors.push('Journal line cannot contain both debit and credit values.');
      }
    }

    const journal = this.buildJournal(
      {
        businessId: transaction.businessId,
        type: transaction.type,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount ?? '0.00',
        referenceNo: transaction.referenceNo,
        financialAccountId: transaction.financialAccountId,
        accountId: transaction.accountId,
        fromFinancialAccountId: transaction.fromFinancialAccountId,
        toFinancialAccountId: transaction.toFinancialAccountId,
        lines: transaction.lines ?? [],
        createdBy: transaction.createdBy,
      },
      transaction.amount ?? '0.00',
    );

    try {
      const validation = this.engine.validateJournal(journal);
      if (!validation.isValid) {
        errors.push(...validation.errors);
      }
      return {
        isValid: errors.length === 0,
        errors,
        totalDebit: validation.totalDebit,
        totalCredit: validation.totalCredit,
      };
    } catch (error) {
      errors.push((error as Error).message);
      return {
        isValid: false,
        errors,
        totalDebit: '0.00',
        totalCredit: '0.00',
      };
    }
  }

  createTransaction(input: TransactionCreateInput): TransactionRecord {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);

    if (input.type === 'MONEY_IN' || input.type === 'MONEY_OUT') {
      this.assertBusinessOwnedFinancialAccount(input.businessId, input.financialAccountId, 'Financial account');
      this.assertBusinessOwnedAccount(input.businessId, input.accountId, input.type === 'MONEY_IN' ? 'Revenue account' : 'Expense account');
    }

    if (input.type === 'TRANSFER') {
      this.assertBusinessOwnedFinancialAccount(input.businessId, input.fromFinancialAccountId, 'Source financial account', true);
      this.assertBusinessOwnedFinancialAccount(input.businessId, input.toFinancialAccountId, 'Destination financial account', true);
    }

    if (input.idempotencyKey && this.idempotency.has(input.idempotencyKey)) {
      const existingId = this.idempotency.get(input.idempotencyKey);
      const existing = existingId ? this.transactions.get(existingId) : undefined;
      if (existing) {
        return existing;
      }
    }

    const validation = this.validateTransaction(input);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    if (!input.date) {
      throw new Error('Transaction date is required.');
    }

    const now = new Date().toISOString();
    const baseRecord: TransactionRecord = {
      id: `txn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      businessId: input.businessId,
      type: input.type,
      date: input.date,
      description: input.description,
      referenceNo: input.referenceNo,
      amount: input.amount ?? '0.00',
      financialAccountId: input.financialAccountId,
      accountId: input.accountId,
      fromFinancialAccountId: input.fromFinancialAccountId,
      toFinancialAccountId: input.toFinancialAccountId,
      status: 'DRAFT',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      lines: input.lines ?? [],
      auditTrail: [
        {
          businessId: input.businessId,
          actor: input.createdBy ?? 'system',
          action: 'TRANSACTION_CREATED',
          entityType: 'TRANSACTION',
          entityId: 'pending',
          timestamp: now,
          details: input.description,
        },
      ],
    };

    const journal = this.buildJournal(input, baseRecord.amount);
    const createdJournal = this.engine.createJournal(journal);
    const transaction: TransactionRecord = {
      ...baseRecord,
      journalId: createdJournal.id,
      journal: createdJournal,
      amount: baseRecord.amount,
      auditTrail: baseRecord.auditTrail?.map((event) => ({ ...event, entityId: `txn-${Date.now()}` })),
    };

    this.transactions.set(transaction.id, transaction);
    if (input.idempotencyKey) {
      this.idempotency.set(input.idempotencyKey, transaction.id);
    }

    return transaction;
  }

  reviewTransaction(transactionId: string, reviewedBy: string): TransactionRecord {
    const transaction = this.getTransaction(transactionId);
    if (transaction.status === 'POSTED' || transaction.status === 'VOIDED') {
      throw new Error('Only non-posted transactions can be reviewed.');
    }

    const updated = this.addAuditEvent({
      ...transaction,
      status: 'REVIEW',
      updatedAt: new Date().toISOString(),
    }, 'TRANSACTION_REVIEWED', reviewedBy, `Reviewed by ${reviewedBy}`);

    this.transactions.set(transactionId, updated);
    return updated;
  }

  approveTransaction(transactionId: string, approvedBy: string): TransactionRecord {
    const transaction = this.getTransaction(transactionId);
    if (transaction.status === 'POSTED' || transaction.status === 'VOIDED') {
      throw new Error('Only active transactions can be approved.');
    }

    const updated = this.addAuditEvent({
      ...transaction,
      status: 'APPROVED',
      updatedAt: new Date().toISOString(),
    }, 'TRANSACTION_APPROVED', approvedBy, `Approved by ${approvedBy}`);

    this.transactions.set(transactionId, updated);
    return updated;
  }

  voidTransaction(transactionId: string, voidedBy: string, reason: string): TransactionRecord {
    const transaction = this.getTransaction(transactionId);
    if (transaction.status === 'POSTED') {
      throw new Error('Posted transactions must be reversed instead of voided.');
    }

    const updated = this.addAuditEvent({
      ...transaction,
      status: 'VOIDED',
      updatedAt: new Date().toISOString(),
    }, 'TRANSACTION_VOIDED', voidedBy, reason);

    this.transactions.set(transactionId, updated);
    return updated;
  }

  postTransaction(transactionId: string, postedBy: string, idempotencyKey?: string): TransactionRecord {
    const existing = this.transactions.get(transactionId);
    if (!existing) {
      throw new Error('Transaction not found.');
    }

    if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
      const existingId = this.idempotency.get(idempotencyKey);
      const idempotent = existingId ? this.transactions.get(existingId) : undefined;
      if (idempotent && idempotent.status === 'POSTED') {
        return idempotent;
      }
    }

    if (existing.status === 'POSTED') {
      return existing;
    }

    if (existing.status === 'VOIDED') {
      throw new Error('Void transactions cannot be posted.');
    }

    if (!existing.journal) {
      throw new Error('Transaction journal is missing.');
    }

    const postedJournal = this.engine.postJournal(existing.journal, {
      postedBy,
      idempotencyKey,
    });

    const updated: TransactionRecord = this.addAuditEvent({
      ...existing,
      status: 'POSTED',
      updatedAt: new Date().toISOString(),
      journal: postedJournal,
      journalId: postedJournal.id,
    }, 'TRANSACTION_POSTED', postedBy, `Journal ${postedJournal.journalNo} posted`);

    this.transactions.set(transactionId, updated);
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, transactionId);
    }
    return updated;
  }

  private buildJournal(input: TransactionCreateInput, amount: string): JournalInput {
    const common = {
      businessId: input.businessId,
      journalDate: input.date,
      sourceType: 'MANUAL' as const,
      description: input.description,
      referenceNo: input.referenceNo,
    };

    if (input.type === 'MONEY_IN') {
      if (!input.financialAccountId || !input.accountId) {
        throw new Error('Money In requires a financial account and revenue account.');
      }
      if (Number(amount) <= 0) {
        throw new Error('Money In amount must be greater than zero.');
      }
      return createMoneyInJournal({
        ...common,
        financialAccountId: input.financialAccountId,
        revenueAccountId: input.accountId,
        amount,
      });
    }

    if (input.type === 'MONEY_OUT') {
      if (!input.financialAccountId || !input.accountId) {
        throw new Error('Money Out requires a financial account and expense account.');
      }
      if (Number(amount) <= 0) {
        throw new Error('Money Out amount must be greater than zero.');
      }
      return createMoneyOutJournal({
        ...common,
        financialAccountId: input.financialAccountId,
        expenseAccountId: input.accountId,
        amount,
      });
    }

    if (input.type === 'TRANSFER') {
      if (!input.fromFinancialAccountId || !input.toFinancialAccountId) {
        throw new Error('Transfer requires source and destination financial accounts.');
      }
      if (input.fromFinancialAccountId === input.toFinancialAccountId) {
        throw new Error('Source and destination accounts cannot be the same.');
      }
      if (Number(amount) <= 0) {
        throw new Error('Transfer amount must be greater than zero.');
      }
      return createTransferJournal({
        ...common,
        fromFinancialAccountId: input.fromFinancialAccountId,
        toFinancialAccountId: input.toFinancialAccountId,
        fromAccountId: input.fromFinancialAccountId,
        toAccountId: input.toFinancialAccountId,
        amount,
      });
    }

    if (!input.lines || input.lines.length < 2) {
      throw new Error('Journal entries require at least two lines.');
    }

    const lines: JournalLineInput[] = input.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    }));

    return {
      ...common,
      journalNo: `JRN-${Date.now()}`,
      lines,
    };
  }
}
