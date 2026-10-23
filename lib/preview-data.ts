import { AccountingEngine, type BusinessAccount } from '../packages/accounting';
import { FinancialReportService } from '../packages/reports';

export const PREVIEW_BUSINESS_ID = 'preview-business-0001';
export const PREVIEW_BUSINESS_NAME = 'Preview business';
export const PREVIEW_USER_EMAIL = 'preview@opsfinance.local';
export const PREVIEW_USER_ID = 'preview-user-0001';

export type PreviewBusinessRecord = {
  id: string;
  name: string;
  ownerId: string;
  userIds: string[];
  registrationNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  baseCurrency: string;
  fiscalYearStart: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PreviewAccountRecord = {
  id: string;
  business_id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PreviewFinancialAccountRecord = {
  id: string;
  business_id: string;
  name: string;
  type: string;
  account_code: string;
  currency: string;
  account_id: string | null;
  opening_balance: string;
  opening_balance_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PreviewJournalLine = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: string;
  credit: string;
  description: string;
  financial_account_id: string | null;
  contact_id: string | null;
  created_at: string;
};

export type PreviewJournalEntryRecord = {
  id: string;
  business_id: string;
  journal_no: string;
  journal_date: string;
  source_type: string;
  description: string;
  status: 'POSTED' | 'DRAFT';
  reference_no: string | null;
  created_at: string;
  updated_at: string;
  journal_lines: PreviewJournalLine[];
};

export type PreviewStore = {
  business: PreviewBusinessRecord;
  accounts: PreviewAccountRecord[];
  financialAccounts: PreviewFinancialAccountRecord[];
  journalEntries: PreviewJournalEntryRecord[];
};

function createSeedAccount(data: Partial<PreviewAccountRecord> & { id: string; code: string; name: string; account_type: string; normal_balance: string }): PreviewAccountRecord {
  const now = new Date().toISOString();
  return {
    id: data.id,
    business_id: data.business_id ?? PREVIEW_BUSINESS_ID,
    code: data.code,
    name: data.name,
    account_type: data.account_type,
    normal_balance: data.normal_balance,
    parent_id: data.parent_id ?? null,
    is_system: data.is_system ?? false,
    is_active: data.is_active ?? true,
    created_at: data.created_at ?? now,
    updated_at: data.updated_at ?? now,
  };
}

function createSeedFinancialAccount(data: Partial<PreviewFinancialAccountRecord> & { id: string; name: string; type: string; account_code: string; currency: string; }): PreviewFinancialAccountRecord {
  const now = new Date().toISOString();
  return {
    id: data.id,
    business_id: data.business_id ?? PREVIEW_BUSINESS_ID,
    name: data.name,
    type: data.type,
    account_code: data.account_code,
    currency: data.currency,
    account_id: data.account_id ?? null,
    opening_balance: String(data.opening_balance ?? '0.00'),
    opening_balance_date: data.opening_balance_date ?? '2026-01-01',
    status: data.status ?? 'ACTIVE',
    created_at: data.created_at ?? now,
    updated_at: data.updated_at ?? now,
  };
}

function buildSeedStore(): PreviewStore {
  const now = new Date().toISOString();
  const accounts: PreviewAccountRecord[] = [
    createSeedAccount({ id: 'acct-cash', business_id: PREVIEW_BUSINESS_ID, code: '1010', name: 'Cash', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true }),
    createSeedAccount({ id: 'acct-bank', business_id: PREVIEW_BUSINESS_ID, code: '1020', name: 'Bank', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true }),
    createSeedAccount({ id: 'acct-ar', business_id: PREVIEW_BUSINESS_ID, code: '1100', name: 'Accounts Receivable', account_type: 'ASSET', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: 'acct-pp', business_id: PREVIEW_BUSINESS_ID, code: '1500', name: 'Office Equipment', account_type: 'ASSET', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: 'acct-ap', business_id: PREVIEW_BUSINESS_ID, code: '2000', name: 'Accounts Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: 'acct-loan', business_id: PREVIEW_BUSINESS_ID, code: '2100', name: 'Loan Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: 'acct-equity', business_id: PREVIEW_BUSINESS_ID, code: '3000', name: 'Owner Equity', account_type: 'EQUITY', normal_balance: 'CREDIT', is_system: true }),
    createSeedAccount({ id: 'acct-revenue', business_id: PREVIEW_BUSINESS_ID, code: '4000', name: 'Sales Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: 'acct-rent', business_id: PREVIEW_BUSINESS_ID, code: '5000', name: 'Rent Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: 'acct-supplies', business_id: PREVIEW_BUSINESS_ID, code: '5100', name: 'Office Supplies', account_type: 'EXPENSE', normal_balance: 'DEBIT' }),
  ];

  const financialAccounts: PreviewFinancialAccountRecord[] = [
    createSeedFinancialAccount({ id: 'fin-maybank', business_id: PREVIEW_BUSINESS_ID, name: 'Maybank Operating', type: 'BANK', account_code: 'MAY-001', currency: 'MYR', account_id: 'acct-bank' }),
    createSeedFinancialAccount({ id: 'fin-cash', business_id: PREVIEW_BUSINESS_ID, name: 'Cash on Hand', type: 'CASH', account_code: 'CASH-001', currency: 'MYR', account_id: 'acct-cash' }),
  ];

  const journalEntries: PreviewJournalEntryRecord[] = [
    {
      id: 'journal-sale-001',
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-001',
      journal_date: '2026-10-01',
      source_type: 'MANUAL',
      description: 'Customer invoice posting',
      status: 'POSTED',
      reference_no: 'INV-2026-001',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: 'line-sale-debit', journal_entry_id: 'journal-sale-001', account_id: 'acct-bank', debit: '12000.00', credit: '0.00', description: 'Cash collection', financial_account_id: 'fin-maybank', contact_id: null, created_at: now },
        { id: 'line-sale-credit', journal_entry_id: 'journal-sale-001', account_id: 'acct-revenue', debit: '0.00', credit: '12000.00', description: 'Service revenue', financial_account_id: null, contact_id: null, created_at: now },
      ],
    },
    {
      id: 'journal-rent-001',
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-002',
      journal_date: '2026-10-02',
      source_type: 'MANUAL',
      description: 'Office rent expense',
      status: 'POSTED',
      reference_no: 'BILL-2026-001',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: 'line-rent-debit', journal_entry_id: 'journal-rent-001', account_id: 'acct-rent', debit: '3000.00', credit: '0.00', description: 'Office rent', financial_account_id: 'fin-maybank', contact_id: null, created_at: now },
        { id: 'line-rent-credit', journal_entry_id: 'journal-rent-001', account_id: 'acct-bank', debit: '0.00', credit: '3000.00', description: 'Bank payment', financial_account_id: 'fin-maybank', contact_id: null, created_at: now },
      ],
    },
    {
      id: 'journal-supplies-001',
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-003',
      journal_date: '2026-10-03',
      source_type: 'MANUAL',
      description: 'Office supplies purchase',
      status: 'POSTED',
      reference_no: 'PO-2026-010',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: 'line-supplies-debit', journal_entry_id: 'journal-supplies-001', account_id: 'acct-supplies', debit: '850.00', credit: '0.00', description: 'Office supplies', financial_account_id: 'fin-maybank', contact_id: null, created_at: now },
        { id: 'line-supplies-credit', journal_entry_id: 'journal-supplies-001', account_id: 'acct-bank', debit: '0.00', credit: '850.00', description: 'Bank payment', financial_account_id: 'fin-maybank', contact_id: null, created_at: now },
      ],
    },
  ];

  return {
    business: {
      id: PREVIEW_BUSINESS_ID,
      name: PREVIEW_BUSINESS_NAME,
      ownerId: PREVIEW_USER_ID,
      userIds: [PREVIEW_USER_ID],
      registrationNo: 'PV-2026-001',
      address: 'Preview Office, Kuala Lumpur',
      phone: '+60300000000',
      email: PREVIEW_USER_EMAIL,
      baseCurrency: 'MYR',
      fiscalYearStart: '2026-01-01',
      createdAt: now,
      updatedAt: now,
    },
    accounts,
    financialAccounts,
    journalEntries,
  };
}

let previewStore: PreviewStore | null = null;

export function getPreviewStore(): PreviewStore {
  if (!previewStore) {
    previewStore = buildSeedStore();
  }
  return previewStore;
}

export function getPreviewBusinessContext() {
  return {
    businessId: PREVIEW_BUSINESS_ID,
    businessName: PREVIEW_BUSINESS_NAME,
    userEmail: PREVIEW_USER_EMAIL,
    userId: PREVIEW_USER_ID,
  };
}

export function getPreviewFinancialSnapshot() {
  const seed = getPreviewStore();
  const mappedAccounts = seed.accounts.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    isSystem: row.is_system,
    isActive: row.is_active,
    parentId: row.parent_id,
  })) as BusinessAccount[];

  const engine = new AccountingEngine({ businessId: PREVIEW_BUSINESS_ID, accounts: mappedAccounts });
  const service = new FinancialReportService({
    engine,
    repository: {
      getBusinessAccounts: () => mappedAccounts,
      getPostedJournals: () =>
        seed.journalEntries.map((entry) => ({
          id: entry.id,
          businessId: entry.business_id,
          journalNo: entry.journal_no,
          journalDate: entry.journal_date,
          sourceType: entry.source_type as 'MANUAL' | 'UPLOAD' | 'IMPORT' | 'SYSTEM',
          description: entry.description,
          status: entry.status,
          referenceNo: entry.reference_no ?? undefined,
          lines: entry.journal_lines.map((line) => ({
            id: line.id,
            journalEntryId: line.journal_entry_id,
            accountId: line.account_id,
            debit: String(line.debit ?? '0.00'),
            credit: String(line.credit ?? '0.00'),
            description: line.description,
            financialAccountId: line.financial_account_id ?? undefined,
            contactId: line.contact_id ?? undefined,
          })),
          createdAt: entry.created_at,
        })),
    },
  });

  return {
    accounts: mappedAccounts,
    business: seed.business,
    financialAccounts: seed.financialAccounts,
    journalEntries: seed.journalEntries,
    trial: service.getTrialBalance({ businessId: PREVIEW_BUSINESS_ID }),
    pnl: service.getProfitAndLoss({ businessId: PREVIEW_BUSINESS_ID }),
    sheet: service.getBalanceSheet({ businessId: PREVIEW_BUSINESS_ID }),
    cash: service.getCashFlow({ businessId: PREVIEW_BUSINESS_ID }),
    ledger: service.getGeneralLedger({ businessId: PREVIEW_BUSINESS_ID }),
    statement: service.getAccountStatement({ businessId: PREVIEW_BUSINESS_ID, accountId: mappedAccounts[0]?.id ?? '' }),
  };
}

export function createPreviewAccount(input: Partial<PreviewAccountRecord> & { code: string; name: string; account_type: string; normal_balance: string }) {
  const seed = getPreviewStore();
  const id = input.id ?? `acct-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const account: PreviewAccountRecord = {
    ...createSeedAccount({
      id,
      business_id: PREVIEW_BUSINESS_ID,
      code: input.code,
      name: input.name,
      account_type: input.account_type,
      normal_balance: input.normal_balance,
      parent_id: input.parent_id ?? null,
      is_system: input.is_system ?? false,
      is_active: input.is_active ?? true,
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  seed.accounts = [...seed.accounts.filter((row) => row.id !== id), account];
  return account;
}

export function createPreviewFinancialAccount(input: Partial<PreviewFinancialAccountRecord> & { name: string; type: string; account_code: string; currency: string }) {
  const seed = getPreviewStore();
  const id = input.id ?? `fin-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const account: PreviewFinancialAccountRecord = {
    ...createSeedFinancialAccount({
      id,
      business_id: PREVIEW_BUSINESS_ID,
      name: input.name,
      type: input.type,
      account_code: input.account_code,
      currency: input.currency,
      account_id: input.account_id ?? null,
      opening_balance: String(input.opening_balance ?? '0.00'),
      opening_balance_date: input.opening_balance_date ?? new Date().toISOString().slice(0, 10),
      status: input.status ?? 'ACTIVE',
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  seed.financialAccounts = [...seed.financialAccounts.filter((row) => row.id !== id), account];
  return account;
}

export function createPreviewTransaction(input: {
  type?: string;
  date?: string;
  description?: string;
  amount?: string | number;
  reference_no?: string;
  financial_account_id?: string | null;
  account_id?: string | null;
}) {
  const seed = getPreviewStore();
  const safeAmount = Number(input.amount ?? 0);
  const date = String(input.date ?? new Date().toISOString().slice(0, 10));
  const entryId = `preview-transaction-${Date.now()}`;
  const financialAccountId = input.financial_account_id ?? seed.financialAccounts[0]?.id ?? null;
  const accountId = input.account_id ?? seed.accounts[0]?.id ?? null;
  const description = input.description ?? 'Preview transaction';
  const referenceNo = input.reference_no ?? `PV-${Date.now()}`;
  const debit = input.type === 'MONEY_OUT' ? String(safeAmount) : '0.00';
  const credit = input.type === 'MONEY_IN' ? String(safeAmount) : '0.00';

  const entry: PreviewJournalEntryRecord = {
    id: entryId,
    business_id: PREVIEW_BUSINESS_ID,
    journal_no: referenceNo,
    journal_date: date,
    source_type: 'MANUAL',
    description,
    status: 'POSTED',
    reference_no: referenceNo,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    journal_lines: [
      {
        id: `${entryId}-line-1`,
        journal_entry_id: entryId,
        account_id: accountId ?? 'acct-bank',
        debit: input.type === 'MONEY_OUT' ? String(safeAmount) : '0.00',
        credit: input.type === 'MONEY_IN' ? String(safeAmount) : '0.00',
        description,
        financial_account_id: financialAccountId,
        contact_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: `${entryId}-line-2`,
        journal_entry_id: entryId,
        account_id: financialAccountId ? 'acct-bank' : accountId ?? 'acct-bank',
        debit: input.type === 'MONEY_IN' ? String(safeAmount) : '0.00',
        credit: input.type === 'MONEY_OUT' ? String(safeAmount) : '0.00',
        description,
        financial_account_id: financialAccountId,
        contact_id: null,
        created_at: new Date().toISOString(),
      },
    ],
  };

  seed.journalEntries = [entry, ...seed.journalEntries];
  return entry;
}
