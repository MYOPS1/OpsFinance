import type { JournalEntry } from './accounting';
import type { TransactionRecord } from './transactions';
import type { BankTransaction, FinancialStatement, ReconciliationSession } from './reconciliation';
import type { BusinessMember } from './types';
import type { UploadRecord } from './upload';

export interface RepositoryError extends Error {
  code?: string;
}

export interface AccountRepository<T> {
  listByBusiness(businessId: string): T[];
  getById(businessId: string, id: string): T;
  create(input: T): T;
  update(id: string, patch: Partial<T>): T;
}

export interface FinancialAccountRepository<T> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface TransactionRepository<T extends TransactionRecord> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface JournalRepository<T extends JournalEntry> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface UploadRepository<T extends UploadRecord = UploadRecord> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface BankStatementRepository<T extends FinancialStatement = FinancialStatement> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface BankTransactionRepository<T extends BankTransaction = BankTransaction> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface ReconciliationRepository<T extends ReconciliationSession = ReconciliationSession> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export interface MembershipRepository<T extends BusinessMember = BusinessMember> extends AccountRepository<T> {
  listByBusiness(businessId: string): T[];
}

export class LocalAccountRepository<T extends { businessId: string; id: string }> implements AccountRepository<T> {
  protected readonly store = new Map<string, T>();

  listByBusiness(businessId: string): T[] {
    return [...this.store.values()].filter((entry) => entry.businessId === businessId);
  }

  getById(businessId: string, id: string): T {
    const item = this.store.get(id);
    if (!item || item.businessId !== businessId) {
      throw Object.assign(new Error('Account not found for this business.'), { code: 'NOT_FOUND' });
    }
    return item;
  }

  create(input: T): T {
    this.store.set(input.id, input);
    return input;
  }

  update(id: string, patch: Partial<T>): T {
    const existing = this.store.get(id);
    if (!existing) {
      throw Object.assign(new Error('Account record not found.'), { code: 'NOT_FOUND' });
    }
    const updated = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }
}

export class LocalFinancialAccountRepository<T extends { businessId: string; id: string }> extends LocalAccountRepository<T> implements FinancialAccountRepository<T> {}

export class LocalTransactionRepository extends LocalAccountRepository<TransactionRecord> implements TransactionRepository<TransactionRecord> {}

export class LocalJournalRepository extends LocalAccountRepository<JournalEntry> implements JournalRepository<JournalEntry> {}

export class LocalUploadRepository extends LocalAccountRepository<UploadRecord> implements UploadRepository {}

export class LocalBankStatementRepository extends LocalAccountRepository<FinancialStatement> implements BankStatementRepository {}

export class LocalBankTransactionRepository extends LocalAccountRepository<BankTransaction> implements BankTransactionRepository {}

export class LocalReconciliationRepository extends LocalAccountRepository<ReconciliationSession> implements ReconciliationRepository {}

export class LocalMembershipRepository extends LocalAccountRepository<BusinessMember> implements MembershipRepository {}
