import { AccountingEngine, type BusinessAccount } from '../packages/accounting';
import { FinancialReportService } from '../packages/reports';

export const PREVIEW_BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
export const PREVIEW_BUSINESS_NAME = 'Preview business';
export const PREVIEW_USER_EMAIL = 'preview@opsfinance.local';
export const PREVIEW_USER_ID = '22222222-2222-4222-8222-222222222222';

const PREVIEW_ACCOUNT_UUIDS = {
  cash: '33333333-3333-4333-8333-333333333333',
  bank: '44444444-4444-4444-8444-444444444444',
  ar: '55555555-5555-4555-8555-555555555555',
  pp: '66666666-6666-4666-8666-666666666666',
  ap: '77777777-7777-4777-8777-777777777777',
  loan: '88888888-8888-4888-8888-888888888888',
  equity: '99999999-9999-4999-8999-999999999999',
  revenue: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rent: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplies: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

const PREVIEW_FINANCIAL_ACCOUNT_UUIDS = {
  maybank: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  cash: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;

const PREVIEW_JOURNAL_UUIDS = {
  opening: '0f8f0c52-4f68-4a2d-9d5f-4d7f0d0c9b73',
  sale: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  rent: '01234567-89ab-4cde-8f01-23456789abcd',
  supplies: '12345678-9abc-4def-8f12-3456789abcde',
  transfer: '2c9f6d8b-8172-4972-b16f-d7d86d43a7d2',
  equipment: '6bd1d371-8d5f-4891-8d57-1d1ad8efa82e',
  draft: 'd72bc1cb-6fcd-4afb-b6e0-4abdc0c5ad17',
} as const;

function createPreviewUuid(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let mixed = hash >>> 0;
  const chars: string[] = [];
  for (let i = 0; i < 32; i += 1) {
    mixed = Math.imul(mixed ^ (i * 0x9e3779b1 + 0x85ebca6b), 0x85ebca6b) >>> 0;
    chars.push((mixed & 0xff).toString(16).padStart(2, '0'));
  }

  const hex = chars.join('');
  const versioned = hex.split('');
  versioned[12] = '4';
  versioned[16] = ['8', '9', 'a', 'b'][Math.abs(hash) % 4];

  return [
    versioned.slice(0, 8).join(''),
    versioned.slice(8, 12).join(''),
    versioned.slice(12, 16).join(''),
    versioned.slice(16, 20).join(''),
    versioned.slice(20, 32).join(''),
  ].join('-');
}

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
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.cash, business_id: PREVIEW_BUSINESS_ID, code: '1010', name: 'Cash', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.bank, business_id: PREVIEW_BUSINESS_ID, code: '1020', name: 'Bank', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.ar, business_id: PREVIEW_BUSINESS_ID, code: '1100', name: 'Accounts Receivable', account_type: 'ASSET', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.pp, business_id: PREVIEW_BUSINESS_ID, code: '1500', name: 'Office Equipment', account_type: 'ASSET', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.ap, business_id: PREVIEW_BUSINESS_ID, code: '2000', name: 'Accounts Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.loan, business_id: PREVIEW_BUSINESS_ID, code: '2100', name: 'Loan Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.equity, business_id: PREVIEW_BUSINESS_ID, code: '3000', name: 'Owner Equity', account_type: 'EQUITY', normal_balance: 'CREDIT', is_system: true }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.revenue, business_id: PREVIEW_BUSINESS_ID, code: '4000', name: 'Sales Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.rent, business_id: PREVIEW_BUSINESS_ID, code: '5000', name: 'Rent Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT' }),
    createSeedAccount({ id: PREVIEW_ACCOUNT_UUIDS.supplies, business_id: PREVIEW_BUSINESS_ID, code: '5100', name: 'Office Supplies', account_type: 'EXPENSE', normal_balance: 'DEBIT' }),
  ];

  const financialAccounts: PreviewFinancialAccountRecord[] = [
    createSeedFinancialAccount({ id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, business_id: PREVIEW_BUSINESS_ID, name: 'Maybank Operating', type: 'BANK', account_code: 'MAY-001', currency: 'MYR', account_id: PREVIEW_ACCOUNT_UUIDS.bank }),
    createSeedFinancialAccount({ id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.cash, business_id: PREVIEW_BUSINESS_ID, name: 'Cash on Hand', type: 'CASH', account_code: 'CASH-001', currency: 'MYR', account_id: PREVIEW_ACCOUNT_UUIDS.cash }),
  ];

  const journalEntries: PreviewJournalEntryRecord[] = [
    {
      id: PREVIEW_JOURNAL_UUIDS.opening,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'OPEN-2026-001',
      journal_date: '2026-10-01',
      source_type: 'SYSTEM',
      description: 'Opening balances',
      status: 'POSTED',
      reference_no: 'OPENING-001',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.opening}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.opening, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '20000.00', credit: '0.00', description: 'Opening bank balance', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.opening}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.opening, account_id: PREVIEW_ACCOUNT_UUIDS.cash, debit: '2000.00', credit: '0.00', description: 'Opening cash balance', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.cash, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.opening}-line-3`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.opening, account_id: PREVIEW_ACCOUNT_UUIDS.equity, debit: '0.00', credit: '22000.00', description: 'Opening owner equity', financial_account_id: null, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.sale,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-001',
      journal_date: '2026-10-01',
      source_type: 'MANUAL',
      description: 'Customer receipt / Sales Revenue',
      status: 'POSTED',
      reference_no: 'INV-2026-001',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.sale}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.sale, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '12000.00', credit: '0.00', description: 'Bank receipt', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.sale}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.sale, account_id: PREVIEW_ACCOUNT_UUIDS.revenue, debit: '0.00', credit: '12000.00', description: 'Sales revenue', financial_account_id: null, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.rent,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-002',
      journal_date: '2026-10-02',
      source_type: 'MANUAL',
      description: 'Rent payment',
      status: 'POSTED',
      reference_no: 'BILL-2026-001',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.rent}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.rent, account_id: PREVIEW_ACCOUNT_UUIDS.rent, debit: '3000.00', credit: '0.00', description: 'Office rent', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.rent}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.rent, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '0.00', credit: '3000.00', description: 'Bank payment', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.supplies,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-003',
      journal_date: '2026-10-03',
      source_type: 'MANUAL',
      description: 'Office supplies expense',
      status: 'POSTED',
      reference_no: 'PO-2026-010',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.supplies}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.supplies, account_id: PREVIEW_ACCOUNT_UUIDS.supplies, debit: '850.00', credit: '0.00', description: 'Office supplies', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.supplies}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.supplies, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '0.00', credit: '850.00', description: 'Bank payment', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.transfer,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-004',
      journal_date: '2026-10-04',
      source_type: 'MANUAL',
      description: 'Bank to cash transfer',
      status: 'POSTED',
      reference_no: 'TR-2026-004',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.transfer}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.transfer, account_id: PREVIEW_ACCOUNT_UUIDS.cash, debit: '1000.00', credit: '0.00', description: 'Cash increase', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.cash, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.transfer}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.transfer, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '0.00', credit: '1000.00', description: 'Bank transfer out', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.equipment,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-005',
      journal_date: '2026-10-05',
      source_type: 'MANUAL',
      description: 'Office equipment purchased using bank',
      status: 'POSTED',
      reference_no: 'EQ-2026-005',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.equipment}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.equipment, account_id: PREVIEW_ACCOUNT_UUIDS.pp, debit: '5000.00', credit: '0.00', description: 'Office equipment purchase', financial_account_id: null, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.equipment}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.equipment, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '0.00', credit: '5000.00', description: 'Bank payment', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
      ],
    },
    {
      id: PREVIEW_JOURNAL_UUIDS.draft,
      business_id: PREVIEW_BUSINESS_ID,
      journal_no: 'JNL-2026-006',
      journal_date: '2026-10-06',
      source_type: 'MANUAL',
      description: 'Draft transaction to be excluded from reports',
      status: 'DRAFT',
      reference_no: 'DRAFT-2026-006',
      created_at: now,
      updated_at: now,
      journal_lines: [
        { id: `${PREVIEW_JOURNAL_UUIDS.draft}-line-1`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.draft, account_id: PREVIEW_ACCOUNT_UUIDS.bank, debit: '999.00', credit: '0.00', description: 'Draft bank debit', financial_account_id: PREVIEW_FINANCIAL_ACCOUNT_UUIDS.maybank, contact_id: null, created_at: now },
        { id: `${PREVIEW_JOURNAL_UUIDS.draft}-line-2`, journal_entry_id: PREVIEW_JOURNAL_UUIDS.draft, account_id: PREVIEW_ACCOUNT_UUIDS.revenue, debit: '0.00', credit: '999.00', description: 'Draft revenue credit', financial_account_id: null, contact_id: null, created_at: now },
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

export function getPreviewReportRepository() {
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

  return {
    getBusinessAccounts: () => mappedAccounts,
    getPostedJournals: () =>
      seed.journalEntries
        .filter((entry) => entry.status === 'POSTED')
        .map((entry) => ({
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
    repository: getPreviewReportRepository(),
  });

  const dateFrom = '2026-10-01';
  const dateTo = '2026-10-31';

  return {
    accounts: mappedAccounts,
    business: seed.business,
    financialAccounts: seed.financialAccounts,
    journalEntries: seed.journalEntries,
    trial: service.getTrialBalance({ businessId: PREVIEW_BUSINESS_ID, dateFrom, dateTo }),
    pnl: service.getProfitAndLoss({ businessId: PREVIEW_BUSINESS_ID, dateFrom, dateTo }),
    sheet: service.getBalanceSheet({ businessId: PREVIEW_BUSINESS_ID, dateFrom, dateTo }),
    cash: service.getCashFlow({ businessId: PREVIEW_BUSINESS_ID, dateFrom, dateTo }),
    ledger: service.getGeneralLedger({ businessId: PREVIEW_BUSINESS_ID, dateFrom, dateTo }),
    statement: service.getAccountStatement({ businessId: PREVIEW_BUSINESS_ID, accountId: mappedAccounts[0]?.id ?? '', dateFrom, dateTo }),
  };
}

export function createPreviewAccount(input: Partial<PreviewAccountRecord> & { code: string; name: string; account_type: string; normal_balance: string }) {
  const seed = getPreviewStore();
  const id = input.id ?? createPreviewUuid(`preview-account:${input.code}:${input.name}:${Date.now()}`);
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
  const id = input.id ?? createPreviewUuid(`preview-financial-account:${input.account_code}:${input.name}:${Date.now()}`);
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
  const entryId = createPreviewUuid(`preview-transaction:${Date.now()}:${input.reference_no ?? input.description ?? 'preview'}`);
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
        id: createPreviewUuid(`preview-journal-line:${entryId}:debit`),
        journal_entry_id: entryId,
        account_id: accountId ?? PREVIEW_ACCOUNT_UUIDS.bank,
        debit: input.type === 'MONEY_OUT' ? String(safeAmount) : '0.00',
        credit: input.type === 'MONEY_IN' ? String(safeAmount) : '0.00',
        description,
        financial_account_id: financialAccountId,
        contact_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: createPreviewUuid(`preview-journal-line:${entryId}:credit`),
        journal_entry_id: entryId,
        account_id: financialAccountId ? PREVIEW_ACCOUNT_UUIDS.bank : accountId ?? PREVIEW_ACCOUNT_UUIDS.bank,
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
