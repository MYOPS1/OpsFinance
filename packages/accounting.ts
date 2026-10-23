export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type FinancialAccountType = 'BANK' | 'CASH' | 'E_WALLET' | 'CREDIT_CARD' | 'LOAN' | 'OTHER';
export type JournalStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'POSTED' | 'VOIDED';
export type PeriodStatus = 'OPEN' | 'CLOSED';
export type SourceType = 'MANUAL' | 'UPLOAD' | 'IMPORT' | 'SYSTEM';

export interface BusinessAccount {
  id: string;
  businessId: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isSystem?: boolean;
  isActive?: boolean;
  parentId?: string | null;
}

export interface FinancialAccount {
  id: string;
  businessId: string;
  name: string;
  type: FinancialAccountType;
  accountCode: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  openingBalance?: string;
}

export interface AccountingPeriod {
  id: string;
  businessId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt?: string | null;
  closedBy?: string | null;
}

export interface JournalLineInput {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string;
  financialAccountId?: string;
  contactId?: string;
}

export interface JournalInput {
  businessId: string;
  journalNo: string;
  journalDate: string;
  sourceType: SourceType;
  sourceId?: string;
  description?: string;
  lines: JournalLineInput[];
  accountingPeriods?: AccountingPeriod[];
  referenceNo?: string;
}

export interface JournalLine extends JournalLineInput {
  id: string;
  journalEntryId: string;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: string;
  businessId: string;
  journalNo: string;
  journalDate: string;
  sourceType: SourceType;
  sourceId?: string;
  description?: string;
  status: JournalStatus;
  postedAt?: string | null;
  postedBy?: string | null;
  referenceNo?: string;
  lines: JournalLine[];
  createdAt: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  totalDebit: string;
  totalCredit: string;
}

export interface LedgerEntry {
  id: string;
  journalEntryId: string;
  accountId: string;
  businessId: string;
  journalNo: string;
  date: string;
  description?: string;
  debit: string;
  credit: string;
  referenceNo?: string;
}

export interface LedgerSnapshot {
  businessId: string;
  accountId: string;
  balance: string;
  debitTotal: string;
  creditTotal: string;
  entries: LedgerEntry[];
}

export class DecimalMoney {
  private readonly cents: bigint;

  constructor(value: string | number | bigint | DecimalMoney) {
    if (value instanceof DecimalMoney) {
      this.cents = value.cents;
      return;
    }

    if (typeof value === 'bigint') {
      this.cents = value;
      return;
    }

    if (typeof value === 'number') {
      this.cents = DecimalMoney.parseToCents(value.toFixed(2));
      return;
    }

    this.cents = DecimalMoney.parseToCents(value);
  }

  static parseToCents(value: string): bigint {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed === '.' || trimmed === '-.' || trimmed === '+.') {
      return 0n;
    }

    const normalized = trimmed.replace(/[$\s]/g, '').replace(/,/g, '');
    const negative = normalized.startsWith('-');
    const signless = normalized.startsWith('+') || normalized.startsWith('-') ? normalized.slice(1) : normalized;

    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(signless)) {
      throw new Error(`Invalid monetary value: ${value}`);
    }

    const [wholeRaw = '0', fractionRaw = ''] = signless.split('.');
    const whole = wholeRaw || '0';
    const fraction = fractionRaw.padEnd(2, '0').slice(0, 2);
    const cents = BigInt(whole) * 100n + BigInt(fraction);
    return negative ? -cents : cents;
  }

  static zero(): DecimalMoney {
    return new DecimalMoney('0.00');
  }

  add(other: DecimalMoney): DecimalMoney {
    return new DecimalMoney(this.cents + other.cents);
  }

  subtract(other: DecimalMoney): DecimalMoney {
    return new DecimalMoney(this.cents - other.cents);
  }

  compare(other: DecimalMoney): number {
    if (this.cents < other.cents) return -1;
    if (this.cents > other.cents) return 1;
    return 0;
  }

  abs(): DecimalMoney {
    return new DecimalMoney(this.cents < 0n ? -this.cents : this.cents);
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  toString(): string {
    const sign = this.cents < 0n ? '-' : '';
    const abs = this.cents < 0n ? -this.cents : this.cents;
    const whole = (abs / 100n).toString();
    const fraction = (abs % 100n).toString().padStart(2, '0');
    return `${sign}${whole}.${fraction}`;
  }
}

export function createAccountingPeriod(input: {
  businessId: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: PeriodStatus;
}): AccountingPeriod {
  return {
    id: `period-${input.name}`,
    businessId: input.businessId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status ?? 'OPEN',
    closedAt: null,
    closedBy: null,
  };
}

export function createMoneyInJournal(input: {
  businessId: string;
  journalDate: string;
  financialAccountId: string;
  revenueAccountId: string;
  amount: string;
  description: string;
  referenceNo?: string;
}): JournalInput {
  return {
    businessId: input.businessId,
    journalNo: `MI-${Date.now()}`,
    journalDate: input.journalDate,
    sourceType: 'MANUAL',
    description: input.description,
    referenceNo: input.referenceNo,
    lines: [
      { accountId: input.financialAccountId, debit: input.amount, description: input.description },
      { accountId: input.revenueAccountId, credit: input.amount, description: input.description },
    ],
  };
}

export function createMoneyOutJournal(input: {
  businessId: string;
  journalDate: string;
  financialAccountId: string;
  expenseAccountId: string;
  amount: string;
  description: string;
  referenceNo?: string;
}): JournalInput {
  return {
    businessId: input.businessId,
    journalNo: `MO-${Date.now()}`,
    journalDate: input.journalDate,
    sourceType: 'MANUAL',
    description: input.description,
    referenceNo: input.referenceNo,
    lines: [
      { accountId: input.expenseAccountId, debit: input.amount, description: input.description },
      { accountId: input.financialAccountId, credit: input.amount, description: input.description },
    ],
  };
}

export function createTransferJournal(input: {
  businessId: string;
  journalDate: string;
  fromFinancialAccountId: string;
  toFinancialAccountId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  description: string;
  referenceNo?: string;
}): JournalInput {
  return {
    businessId: input.businessId,
    journalNo: `TR-${Date.now()}`,
    journalDate: input.journalDate,
    sourceType: 'MANUAL',
    description: input.description,
    referenceNo: input.referenceNo,
    lines: [
      { accountId: input.toAccountId, debit: input.amount, description: input.description },
      { accountId: input.fromAccountId, credit: input.amount, description: input.description },
    ],
  };
}

export function createOpeningBalanceJournal(input: {
  businessId: string;
  journalDate: string;
  financialAccountId: string;
  openingEquityAccountId: string;
  amount: string;
  description: string;
}): JournalInput {
  return {
    businessId: input.businessId,
    journalNo: `OB-${Date.now()}`,
    journalDate: input.journalDate,
    sourceType: 'SYSTEM',
    description: input.description,
    lines: [
      { accountId: input.financialAccountId, debit: input.amount, description: input.description },
      { accountId: input.openingEquityAccountId, credit: input.amount, description: input.description },
    ],
  };
}

export interface IdempotencyStoreLike {
  has: (key: string) => boolean;
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

export class MapIdempotencyStore implements IdempotencyStoreLike {
  private readonly store = new Map<string, string>();

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }
}

export class AccountingEngine {
  private readonly accounts: Map<string, BusinessAccount>;
  private readonly periods: Map<string, AccountingPeriod>;
  private readonly financialAccounts: Map<string, FinancialAccount>;
  private readonly journals: Map<string, JournalEntry>;
  private readonly idempotency: IdempotencyStoreLike;
  private readonly sourceIdempotency: IdempotencyStoreLike;

  public readonly businessId: string;

  constructor(config: {
    businessId: string;
    accounts: BusinessAccount[];
    periods?: AccountingPeriod[];
    financialAccounts?: FinancialAccount[];
    idempotencyStore?: IdempotencyStoreLike;
    sourceIdempotencyStore?: IdempotencyStoreLike;
  }) {
    this.businessId = config.businessId;
    this.accounts = new Map(config.accounts.map((account) => [account.id, account]));
    this.periods = new Map((config.periods ?? []).map((period) => [period.id, period]));
    this.financialAccounts = new Map((config.financialAccounts ?? []).map((account) => [account.id, account]));
    this.journals = new Map();
    this.idempotency = config.idempotencyStore ?? new MapIdempotencyStore();
    this.sourceIdempotency = config.sourceIdempotencyStore ?? new MapIdempotencyStore();
  }

  authorizeBusiness(actualBusinessId: string, expectedBusinessId: string): void {
    if (actualBusinessId !== expectedBusinessId) {
      throw new Error('Business authorization failed.');
    }
  }

  toDecimal(value: string | number | bigint): DecimalMoney {
    return new DecimalMoney(value);
  }

  private assertBusinessOwnedLedgerAccount(businessId: string, accountId: string): void {
    const account = this.accounts.get(accountId) ?? this.financialAccounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} does not exist.`);
    }
    if (account.businessId !== businessId) {
      throw new Error(`Account ${accountId} does not belong to this business.`);
    }
  }

  createJournal(input: JournalInput): JournalEntry {
    const journal = {
      id: `journal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      businessId: input.businessId,
      journalNo: input.journalNo,
      journalDate: input.journalDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      status: 'DRAFT' as JournalStatus,
      referenceNo: input.referenceNo,
      createdAt: new Date().toISOString(),
      lines: input.lines.map((line, index) => ({
        id: `${input.journalNo}-${index}`,
        journalEntryId: `journal-${Date.now()}`,
        accountId: line.accountId,
        debit: line.debit ?? '0.00',
        credit: line.credit ?? '0.00',
        description: line.description,
        financialAccountId: line.financialAccountId,
        contactId: line.contactId,
      })),
    };

    this.journals.set(journal.id, journal);
    return journal;
  }

  updateJournal(journalId: string, patch: Partial<JournalEntry>): JournalEntry {
    const current = this.journals.get(journalId);
    if (!current) {
      throw new Error('Journal not found.');
    }

    if (current.status === 'POSTED' || current.status === 'VOIDED') {
      throw new Error('Posted or voided journals cannot be edited directly.');
    }

    const updated = { ...current, ...patch };
    this.journals.set(journalId, updated);
    return updated;
  }

  validateJournal(input: JournalInput): ValidationResult {
    const errors: string[] = [];

    this.authorizeBusiness(input.businessId, this.businessId);

    if (!input.journalDate) {
      errors.push('Journal date is required.');
    }

    if (!input.lines || input.lines.length < 2) {
      errors.push('A journal must contain at least two valid lines.');
    }

    let totalDebit = DecimalMoney.zero();
    let totalCredit = DecimalMoney.zero();

    for (const [index, line] of (input.lines ?? []).entries()) {
      const numericDebit = line.debit ? new DecimalMoney(line.debit) : DecimalMoney.zero();
      const numericCredit = line.credit ? new DecimalMoney(line.credit) : DecimalMoney.zero();

      if (!line.accountId) {
        errors.push(`Line ${index + 1} is missing an account.`);
      }

      if (numericDebit.isPositive() && numericCredit.isPositive()) {
        errors.push(`Line ${index + 1} cannot have debit and credit simultaneously.`);
      }

      if (!numericDebit.isPositive() && !numericCredit.isPositive()) {
        errors.push(`Line ${index + 1} must contain a positive debit or credit value.`);
      }

      let account = this.accounts.get(line.accountId);
      if (!account) {
        const financialAccount = this.financialAccounts.get(line.accountId);
        if (financialAccount) {
          account = {
            id: financialAccount.id,
            businessId: financialAccount.businessId,
            code: financialAccount.accountCode,
            name: financialAccount.name,
            accountType: 'ASSET',
            normalBalance: 'DEBIT',
            isSystem: false,
            isActive: financialAccount.status === 'ACTIVE',
          };
        }
      }

      if (!account) {
        errors.push(`Account ${line.accountId} does not exist.`);
      } else if (account.businessId !== input.businessId) {
        errors.push(`Account ${line.accountId} does not belong to this business.`);
      } else if (account.isActive === false) {
        errors.push(`Account ${line.accountId} is inactive.`);
      }

      totalDebit = totalDebit.add(numericDebit);
      totalCredit = totalCredit.add(numericCredit);
    }

    const periodList = input.accountingPeriods ?? [...this.periods.values()];
    const matchingPeriod = periodList.find((period) => {
      const d = new Date(input.journalDate);
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      return period.businessId === input.businessId && d >= start && d <= end;
    });

    if (matchingPeriod?.status === 'CLOSED') {
      errors.push('Transaction cannot be posted because the accounting period is closed.');
    }

    if (totalDebit.compare(totalCredit) !== 0) {
      errors.push(`Journal is unbalanced: debit ${totalDebit.toString()} does not equal credit ${totalCredit.toString()}.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
    };
  }

  postJournal(
    journal: JournalEntry,
    options: { postedBy?: string; idempotencyKey?: string; shouldFail?: boolean } = {},
  ): JournalEntry {
    if (options.shouldFail) {
      return { ...journal, status: 'DRAFT' as JournalStatus };
    }

    const sourceKey = journal.sourceId ? `${journal.businessId}:${journal.sourceId}` : undefined;
    if (options.idempotencyKey && this.idempotency.has(options.idempotencyKey)) {
      return this.journals.get(this.idempotency.get(options.idempotencyKey) ?? '') ?? journal;
    }
    if (sourceKey && this.sourceIdempotency.has(sourceKey)) {
      return this.journals.get(this.sourceIdempotency.get(sourceKey) ?? '') ?? journal;
    }

    const validation = this.validateJournal({
      businessId: journal.businessId,
      journalNo: journal.journalNo,
      journalDate: journal.journalDate,
      sourceType: journal.sourceType,
      sourceId: journal.sourceId,
      description: journal.description,
      referenceNo: journal.referenceNo,
      lines: journal.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        financialAccountId: line.financialAccountId,
        contactId: line.contactId,
      })),
    });

    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    const posted = {
      ...journal,
      status: 'POSTED' as JournalStatus,
      postedAt: new Date().toISOString(),
      postedBy: options.postedBy ?? null,
    };

    this.journals.set(journal.id, posted);

    if (options.idempotencyKey) {
      this.idempotency.set(options.idempotencyKey, journal.id);
    }
    if (sourceKey) {
      this.sourceIdempotency.set(sourceKey, journal.id);
    }

    return posted;
  }

  getLedger(input: { businessId: string; accountId: string; startDate?: string; endDate?: string }): LedgerSnapshot {
    this.authorizeBusiness(input.businessId, this.businessId);
    this.assertBusinessOwnedLedgerAccount(input.businessId, input.accountId);

    const entries: LedgerEntry[] = [];
    for (const journal of this.journals.values()) {
      if (journal.businessId !== input.businessId || journal.status !== 'POSTED') continue;
      if (input.startDate && journal.journalDate < input.startDate) continue;
      if (input.endDate && journal.journalDate > input.endDate) continue;

      for (const line of journal.lines) {
        if (line.accountId !== input.accountId && line.financialAccountId !== input.accountId) continue;
        entries.push({
          id: line.id,
          journalEntryId: journal.id,
          accountId: line.accountId,
          businessId: journal.businessId,
          journalNo: journal.journalNo,
          date: journal.journalDate,
          description: line.description ?? journal.description,
          debit: line.debit,
          credit: line.credit,
          referenceNo: journal.referenceNo,
        });
      }
    }

    const debitTotal = entries.reduce((sum, entry) => sum.add(new DecimalMoney(entry.debit)), DecimalMoney.zero());
    const creditTotal = entries.reduce((sum, entry) => sum.add(new DecimalMoney(entry.credit)), DecimalMoney.zero());
    const account = this.accounts.get(input.accountId) ?? {
      id: input.accountId,
      businessId: input.businessId,
      code: 'UNKNOWN',
      name: 'Unknown',
      accountType: 'ASSET',
      normalBalance: 'DEBIT' as const,
      isSystem: false,
      isActive: true,
    };
    const balance = account.normalBalance === 'CREDIT' ? creditTotal.subtract(debitTotal) : debitTotal.subtract(creditTotal);

    return {
      businessId: input.businessId,
      accountId: input.accountId,
      balance: balance.toString(),
      debitTotal: debitTotal.toString(),
      creditTotal: creditTotal.toString(),
      entries,
    };
  }

  getTrialBalance(businessId: string): { businessId: string; accounts: Array<{ accountId: string; debit: string; credit: string; balance: string }> } {
    this.authorizeBusiness(businessId, this.businessId);
    const accountMap = new Map<string, { debit: DecimalMoney; credit: DecimalMoney }>();

    for (const journal of this.journals.values()) {
      if (journal.businessId !== businessId || journal.status !== 'POSTED') continue;
      for (const line of journal.lines) {
        const current = accountMap.get(line.accountId) ?? { debit: DecimalMoney.zero(), credit: DecimalMoney.zero() };
        current.debit = current.debit.add(new DecimalMoney(line.debit));
        current.credit = current.credit.add(new DecimalMoney(line.credit));
        accountMap.set(line.accountId, current);
      }
    }

    const accounts = [...accountMap.entries()].map(([accountId, totals]) => {
      const account = this.accounts.get(accountId) ?? { normalBalance: 'DEBIT' as const };
      const balance = account.normalBalance === 'CREDIT' ? totals.credit.subtract(totals.debit) : totals.debit.subtract(totals.credit);
      return {
        accountId,
        debit: totals.debit.toString(),
        credit: totals.credit.toString(),
        balance: balance.toString(),
      };
    });

    return { businessId, accounts };
  }

  reverseJournal(
    postedJournal: JournalEntry,
    input: { reason: string; createdBy: string },
  ): JournalEntry {
    if (postedJournal.status !== 'POSTED') {
      throw new Error('Only posted journals can be reversed.');
    }

    const reversal: JournalEntry = {
      id: `reversal-${Date.now()}`,
      businessId: postedJournal.businessId,
      journalNo: `${postedJournal.journalNo}-REV`,
      journalDate: postedJournal.journalDate,
      sourceType: 'SYSTEM',
      sourceId: postedJournal.id,
      description: `${input.reason}: reversal of ${postedJournal.journalNo}`,
      status: 'VOIDED',
      postedAt: new Date().toISOString(),
      postedBy: input.createdBy,
      referenceNo: postedJournal.referenceNo,
      createdAt: new Date().toISOString(),
      lines: postedJournal.lines.map((line) => ({
        id: `${postedJournal.id}-rev-${line.id}`,
        journalEntryId: `reversal-${Date.now()}`,
        accountId: line.accountId,
        debit: line.credit,
        credit: line.debit,
        description: `${line.description ?? 'Reversal'} (reversal)`,
        financialAccountId: line.financialAccountId,
        contactId: line.contactId,
      })),
    };

    this.journals.set(reversal.id, reversal);
    return reversal;
  }
}
