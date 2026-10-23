import { AccountingEngine, DecimalMoney, createOpeningBalanceJournal, type BusinessAccount, type FinancialAccount, type FinancialAccountType } from './accounting';

export type FinancialAccountStatus = 'ACTIVE' | 'INACTIVE';

export interface FinancialAccountRecord extends FinancialAccount {
  accountId: string;
  openingBalanceDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFinancialAccountInput {
  businessId: string;
  name: string;
  type: FinancialAccountType;
  accountCode: string;
  currency: string;
  status?: FinancialAccountStatus;
  accountId: string;
  openingBalance?: string;
  openingBalanceDate?: string;
}

export interface UpdateFinancialAccountInput {
  businessId: string;
  id: string;
  name?: string;
  currency?: string;
  status?: FinancialAccountStatus;
  accountId?: string;
}

export class FinancialAccountService {
  private readonly engine: AccountingEngine;
  private readonly financialAccounts = new Map<string, FinancialAccountRecord>();

  constructor(engine: AccountingEngine) {
    this.engine = engine;
  }

  private getBusinessAccounts(): BusinessAccount[] {
    return [...((this.engine as any).accounts as Map<string, BusinessAccount>).values()].filter(
      (account) => account.businessId === this.engine.businessId,
    );
  }

  private getAccountById(businessId: string, accountId: string): BusinessAccount {
    const allAccounts = [...((this.engine as any).accounts as Map<string, BusinessAccount>).values()];
    const account = allAccounts.find((entry) => entry.id === accountId);

    if (!account) {
      throw new Error('COA mapping not found for this business.');
    }

    if (account.businessId !== businessId) {
      throw new Error('COA mapping does not belong to this business.');
    }

    return account;
  }

  private getOpeningEquityAccount(businessId: string): BusinessAccount {
    const account = this.getBusinessAccounts().find(
      (entry) => entry.businessId === businessId && entry.accountType === 'EQUITY' && entry.isSystem,
    );
    if (!account) {
      throw new Error('No opening equity account is available for this business.');
    }
    return account;
  }

  private registerFinancialAccount(account: FinancialAccountRecord): void {
    const registry = (this.engine as any).financialAccounts as Map<string, FinancialAccount> | undefined;
    if (registry) {
      registry.set(account.id, {
        id: account.id,
        businessId: account.businessId,
        name: account.name,
        type: account.type,
        accountCode: account.accountCode,
        currency: account.currency,
        status: account.status,
        openingBalance: account.openingBalance,
      });
    }
    this.financialAccounts.set(account.id, account);
  }

  private hasJournalActivity(businessId: string, financialAccountId: string): boolean {
    const entries = this.engine.getLedger({ businessId, accountId: financialAccountId }).entries;
    return entries.length > 0;
  }

  listFinancialAccounts(businessId: string): FinancialAccountRecord[] {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);

    return [...this.financialAccounts.values()]
      .filter((account) => account.businessId === businessId)
      .map((account) => ({
        ...account,
        currentBalance: this.engine.getLedger({ businessId, accountId: account.id }).balance,
      })) as FinancialAccountRecord[];
  }

  getFinancialAccount(businessId: string, id: string): FinancialAccountRecord {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    const account = this.financialAccounts.get(id);
    if (!account || account.businessId !== businessId) {
      throw new Error('Financial account not found.');
    }
    return account;
  }

  getCurrentBalance(businessId: string, financialAccountId: string): string {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    return this.engine.getLedger({ businessId, accountId: financialAccountId }).balance;
  }

  createFinancialAccount(input: CreateFinancialAccountInput, actor = 'system'): FinancialAccountRecord {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);

    if (!input.name?.trim()) {
      throw new Error('Financial account name is required.');
    }
    if (!input.accountCode?.trim()) {
      throw new Error('Financial account code is required.');
    }
    if (!input.currency?.trim()) {
      throw new Error('Currency is required.');
    }

    const coaAccount = this.getAccountById(input.businessId, input.accountId);
    if (coaAccount.businessId !== input.businessId) {
      throw new Error('COA mapping does not belong to this business.');
    }

    const duplicate = [...this.financialAccounts.values()].find(
      (account) => account.businessId === input.businessId && account.accountCode.toLowerCase() === input.accountCode.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new Error('Financial account code must be unique within the business.');
    }

    const now = new Date().toISOString();
    const account: FinancialAccountRecord = {
      id: `fa-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      businessId: input.businessId,
      name: input.name.trim(),
      type: input.type,
      accountCode: input.accountCode.trim(),
      currency: input.currency.trim().toUpperCase(),
      status: input.status ?? 'ACTIVE',
      accountId: coaAccount.id,
      openingBalance: input.openingBalance ?? '0.00',
      openingBalanceDate: input.openingBalanceDate ?? new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
    };

    this.registerFinancialAccount(account);

    const openingBalance = new DecimalMoney(input.openingBalance ?? '0.00');
    if (!openingBalance.isZero()) {
      const openingJournal = this.engine.createJournal(createOpeningBalanceJournal({
        businessId: input.businessId,
        journalDate: account.openingBalanceDate ?? now.slice(0, 10),
        financialAccountId: account.id,
        openingEquityAccountId: this.getOpeningEquityAccount(input.businessId).id,
        amount: input.openingBalance ?? '0.00',
        description: `Opening balance for ${account.name}`,
      }));
      this.engine.postJournal(openingJournal, {
        postedBy: actor,
        idempotencyKey: `opening-${account.id}`,
      });
    }

    return account;
  }

  updateFinancialAccount(input: UpdateFinancialAccountInput, actor = 'system'): FinancialAccountRecord {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const account = this.getFinancialAccount(input.businessId, input.id);

    const nextName = input.name?.trim() ?? account.name;
    const nextCurrency = input.currency?.trim().toUpperCase() ?? account.currency;
    const nextStatus = input.status ?? account.status;
    const nextAccountId = input.accountId ?? account.accountId;

    if (input.accountId && nextAccountId !== account.accountId && this.hasJournalActivity(input.businessId, account.id)) {
      throw new Error('Financial account mapping cannot be changed after accounting activity exists.');
    }

    const updated: FinancialAccountRecord = {
      ...account,
      name: nextName,
      currency: nextCurrency,
      status: nextStatus,
      accountId: nextAccountId,
      updatedAt: new Date().toISOString(),
    };

    if (input.accountId) {
      const coaAccount = this.getAccountById(input.businessId, input.accountId);
      if (coaAccount.businessId !== input.businessId) {
        throw new Error('COA mapping does not belong to this business.');
      }
    }

    this.registerFinancialAccount(updated);

    return updated;
  }
}
