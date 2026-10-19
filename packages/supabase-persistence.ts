import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountingPeriod, BusinessAccount, FinancialAccount, JournalEntry, JournalLine } from './accounting';
import type { TransactionRecord } from './transactions';
import type { Business, BusinessMember } from './types';

export interface BusinessScopedRecord {
  id: string;
  business_id?: string;
  businessId?: string;
}

export interface SupabaseClientLike {
  from: (table: string) => any;
}

export function withBusinessScope<T>(query: T, businessId: string): T {
  if (!businessId || !businessId.trim()) {
    throw new Error('Business access denied.');
  }

  return (query as any).eq('business_id', businessId) as T;
}

export function sanitizeBusinessId(businessId: string | undefined | null): string {
  const value = String(businessId ?? '').trim();
  if (!value) {
    throw new Error('Business access denied.');
  }
  return value;
}

async function runSupabaseMutation<T>(operation: () => Promise<any> | any): Promise<{ data: T | null; error: { message?: string } | null }> {
  const builder = operation();

  if (builder && typeof builder === 'object' && 'select' in builder) {
    const selected = await builder.select();
    if (selected && typeof selected === 'object' && 'error' in selected) {
      return { data: (selected as any).data ?? null, error: (selected as any).error ?? null };
    }
    if (selected && typeof selected === 'object' && 'single' in selected) {
      const single = await selected.single();
      return { data: (single as any).data ?? null, error: (single as any).error ?? null };
    }
    if (selected && typeof selected === 'object' && 'data' in selected) {
      return { data: (selected as any).data ?? null, error: null };
    }
  }

  const result = await builder;
  if (result && typeof result === 'object' && 'data' in result && 'error' in result) {
    return { data: (result as any).data ?? null, error: (result as any).error ?? null };
  }

  if (result && typeof result === 'object' && 'single' in result) {
    const single = await result.single();
    return { data: (single as any).data ?? null, error: (single as any).error ?? null };
  }

  return { data: null, error: null };
}

export class SupabaseRepositoryAdapter<T extends BusinessScopedRecord> {
  constructor(
    private readonly tableName: string,
    protected readonly client: SupabaseClientLike,
    private readonly businessKey = 'business_id',
  ) {}

  async listByBusiness(businessId: string): Promise<T[]> {
    const businessScope = sanitizeBusinessId(businessId);
    const query = (this.client.from(this.tableName) as any).select('*');
    const scoped = this.businessKey === 'business_id' ? query.eq(this.businessKey, businessScope) : query.eq('id', businessScope);
    const result = await scoped;

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase repository query failed.');
    }

    return (Array.isArray(result.data) ? result.data : []) as T[];
  }

  async getById(businessId: string, id: string): Promise<T> {
    const businessScope = sanitizeBusinessId(businessId);
    const query = (this.client.from(this.tableName) as any).select('*').eq('id', id);
    const scoped = this.businessKey === 'business_id' ? query.eq(this.businessKey, businessScope) : query;
    const result = await scoped.maybeSingle();

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase repository lookup failed.');
    }

    if (!result.data) {
      throw new Error('Account not found for this business.');
    }

    return result.data as T;
  }

  async create(input: T): Promise<T> {
    const result = await (this.client.from(this.tableName) as any).insert(input).select();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase repository insert failed.');
    }
    return (result.data?.[0] ?? input) as T;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const result = await (this.client.from(this.tableName) as any).update(patch).eq('id', id).select();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase repository update failed.');
    }
    return (result.data?.[0] ?? ({ ...patch, id } as T)) as T;
  }
}

export class SupabaseBusinessRepository {
  constructor(private readonly client: SupabaseClientLike) {}

  async listForUser(userId: string): Promise<Business[]> {
    if (!userId) {
      throw new Error('Business access denied.');
    }

    const result = await (this.client.from('business_members') as any)
      .select('business_id, businesses(*)')
      .eq('user_id', userId);

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase business lookup failed.');
    }

    return (result.data ?? []).map((row: any) => row.businesses).filter(Boolean) as Business[];
  }

  async getForUser(userId: string, businessId: string): Promise<Business> {
    const scope = sanitizeBusinessId(businessId);
    const membershipResult = await (this.client.from('business_members') as any)
      .select('business_id')
      .eq('user_id', userId)
      .eq('business_id', scope)
      .maybeSingle();

    if (membershipResult.error) {
      throw new Error(membershipResult.error.message ?? 'Business access denied.');
    }

    if (!membershipResult.data) {
      throw new Error('Business access denied.');
    }

    const result = await (this.client.from('businesses') as any).select('*').eq('id', scope).maybeSingle();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase business lookup failed.');
    }
    if (!result.data) {
      throw new Error('Business not found.');
    }
    return result.data as Business;
  }

  async create(userId: string, input: Partial<Business> & Pick<Business, 'name' | 'baseCurrency'>): Promise<Business> {
    const { data, error } = await runSupabaseMutation<Business>(() =>
      (this.client.from('businesses') as any).insert({
        id: input.id,
        name: input.name,
        registration_no: input.registrationNo ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        base_currency: input.baseCurrency ?? 'MYR',
        fiscal_year_start: input.fiscalYearStart ?? null,
      }),
    );

    if (error) {
      throw new Error(error.message ?? 'Supabase business creation failed.');
    }

    const persistedBusiness = Array.isArray(data) ? data[0] ?? null : data;
    if (!persistedBusiness) {
      throw new Error('Supabase business creation returned no row.');
    }

    const membershipResult = await runSupabaseMutation<any>(() =>
      (this.client.from('business_members') as any).upsert(
        {
          business_id: persistedBusiness.id,
          user_id: userId,
          role: 'OWNER',
        },
        { onConflict: 'business_id,user_id' },
      ),
    );

    if (membershipResult.error) {
      throw new Error(membershipResult.error.message ?? 'Supabase business membership creation failed.');
    }

    const subscriptionRepo = new SupabaseSubscriptionRepository(this.client);
    await subscriptionRepo.ensureTrialSubscription({
      businessId: persistedBusiness.id,
      planCode: 'STARTER',
      status: 'TRIAL',
      monthlyPrice: '29.00',
      currency: 'MYR',
    });

    return persistedBusiness as Business;
  }
}

export class SupabaseSubscriptionRepository extends SupabaseRepositoryAdapter<any> {
  constructor(client: SupabaseClientLike) {
    super('subscriptions', client, 'business_id');
  }

  async getByBusiness(businessId: string): Promise<any> {
    const scope = sanitizeBusinessId(businessId);
    const result = await (this.client.from('subscriptions') as any)
      .select('*')
      .eq('business_id', scope)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase subscription lookup failed.');
    }

    return result.data ?? null;
  }

  async create(input: {
    id?: string;
    businessId: string;
    planCode?: string;
    status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    monthlyPrice?: string | null;
    currency?: string | null;
  }): Promise<any> {
    const now = new Date().toISOString();
    const payload = {
      id: input.id ?? crypto.randomUUID(),
      business_id: sanitizeBusinessId(input.businessId),
      plan_code: input.planCode ?? 'STARTER',
      status: input.status ?? 'TRIAL',
      current_period_start: input.currentPeriodStart ?? now,
      current_period_end: input.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_started_at: input.trialStartedAt ?? now,
      trial_ends_at: input.trialEndsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
      updated_at: now,
    };

    const result = await runSupabaseMutation<any>(() => (this.client.from('subscriptions') as any).insert(payload));

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase subscription insert failed.');
    }

    return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
  }

  async ensureTrialSubscription(input: {
    businessId: string;
    planCode?: string;
    status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
    monthlyPrice?: string | null;
    currency?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
  }): Promise<any> {
    const businessId = sanitizeBusinessId(input.businessId);
    const now = new Date().toISOString();
    const preferredStatus = input.status ?? 'TRIAL';

    const persistWithStatus = async (status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED') => {
      const payload = {
        business_id: businessId,
        plan_code: input.planCode ?? 'STARTER',
        status,
        current_period_start: input.currentPeriodStart ?? now,
        current_period_end: input.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trial_started_at: input.trialStartedAt ?? now,
        trial_ends_at: input.trialEndsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
        updated_at: now,
      };

      const existingResult = await (this.client.from('subscriptions') as any)
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle();

      if (existingResult.error) {
        throw new Error(existingResult.error.message ?? 'Supabase existing subscription lookup failed.');
      }

      if (existingResult.data) {
        const result = await runSupabaseMutation<any>(() =>
          (this.client.from('subscriptions') as any)
            .update({ ...payload, updated_at: now })
            .eq('business_id', businessId)
            .select(),
        );

        if (result.error) {
          throw new Error(result.error.message ?? 'Supabase trial subscription update failed.');
        }
        return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
      }

      const result = await runSupabaseMutation<any>(() => (this.client.from('subscriptions') as any).insert(payload).select());
      if (result.error) {
        throw new Error(result.error.message ?? 'Supabase trial subscription insert failed.');
      }

      return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
    };

    try {
      return await persistWithStatus(preferredStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      const isEnumMismatch = /invalid input value for enum subscription_status_enum|subscription_status_enum/i.test(message);
      if (preferredStatus === 'TRIAL' && isEnumMismatch) {
        throw new Error(
          'Supabase subscription_status_enum is missing TRIAL. Apply the live migration before creating a trial subscription.',
        );
      }
      throw error;
    }
  }

  async updateByBusiness(businessId: string, patch: Record<string, any>): Promise<any> {
    const scope = sanitizeBusinessId(businessId);
    const result = await runSupabaseMutation<any>(() =>
      (this.client.from('subscriptions') as any)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('business_id', scope),
    );

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase subscription update failed.');
    }

    return Array.isArray(result.data) ? result.data[0] ?? null : result.data;
  }
}

export class SupabaseMembershipRepository {
  constructor(private readonly client: SupabaseClientLike) {}

  async listByBusiness(businessId: string): Promise<BusinessMember[]> {
    const scope = sanitizeBusinessId(businessId);
    const result = await (this.client.from('business_members') as any).select('*').eq('business_id', scope);
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase membership lookup failed.');
    }
    return (result.data ?? []) as BusinessMember[];
  }

  async ensureOwner(userId: string, businessId: string): Promise<BusinessMember> {
    const scope = sanitizeBusinessId(businessId);
    const upsertResult = await (this.client.from('business_members') as any)
      .upsert({ business_id: scope, user_id: userId, role: 'OWNER' }, { onConflict: 'business_id,user_id' })
      .select()
      .single();

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message ?? 'Supabase membership write failed.');
    }

    return upsertResult.data as BusinessMember;
  }
}

export class SupabaseFinancialAccountRepository extends SupabaseRepositoryAdapter<FinancialAccount> {
  constructor(client: SupabaseClientLike) {
    super('financial_accounts', client, 'business_id');
  }

  async upsertByCode(businessId: string, account: Omit<FinancialAccount, 'id' | 'businessId'> & { id?: string; business_id?: string }): Promise<FinancialAccount> {
    const scope = sanitizeBusinessId(businessId);
    const payload = {
      id: account.id,
      business_id: scope,
      name: account.name,
      type: account.type,
      account_code: account.accountCode,
      currency: account.currency,
      opening_balance: account.openingBalance ?? '0.00',
      opening_balance_date: null,
      status: account.status ?? 'ACTIVE',
    };

    const result = await (this['client'] as any).from('financial_accounts').upsert(payload, { onConflict: 'business_id,account_code' }).select().single();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase financial account upsert failed.');
    }
    return result.data as FinancialAccount;
  }
}

export class SupabaseAccountRepository extends SupabaseRepositoryAdapter<any> {
  constructor(client: SupabaseClientLike) {
    super('accounts', client, 'business_id');
  }

  async upsertByCode(businessId: string, account: { code: string; name: string; account_type: string; normal_balance: 'DEBIT' | 'CREDIT'; is_system?: boolean; is_active?: boolean; parent_id?: string | null }): Promise<any> {
    const scope = sanitizeBusinessId(businessId);
    const payload = {
      business_id: scope,
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      parent_id: account.parent_id ?? null,
      normal_balance: account.normal_balance as 'DEBIT' | 'CREDIT',
      is_system: account.is_system ?? false,
      is_active: account.is_active ?? true,
    };

    const result = await (this['client'] as any).from('accounts').upsert(payload, { onConflict: 'business_id,code' }).select().single();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase chart-of-accounts upsert failed.');
    }
    return result.data as any;
  }

  async ensureDefaultAccounts(businessId: string): Promise<Record<string, any>[]> {
    const defaults: Array<{ code: string; name: string; account_type: string; normal_balance: 'DEBIT' | 'CREDIT'; is_system: boolean; is_active: boolean }> = [
      { code: '1000', name: 'Assets', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true, is_active: true },
      { code: '1100', name: 'Cash', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true, is_active: true },
      { code: '1110', name: 'Maybank', account_type: 'ASSET', normal_balance: 'DEBIT', is_system: true, is_active: true },
      { code: '4000', name: 'Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', is_system: true, is_active: true },
      { code: '4100', name: 'Sales', account_type: 'REVENUE', normal_balance: 'CREDIT', is_system: true, is_active: true },
      { code: '6000', name: 'Expenses', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_system: true, is_active: true },
      { code: '6100', name: 'Rental', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_system: true, is_active: true },
    ];

    const created: Record<string, any>[] = [];
    for (const account of defaults) {
      const row = await this.upsertByCode(businessId, account);
      created.push(row);
    }

    return created;
  }
}

export class SupabaseTransactionRepository extends SupabaseRepositoryAdapter<TransactionRecord> {
  constructor(client: SupabaseClientLike) {
    super('transactions', client, 'business_id');
  }

  async create(input: Omit<TransactionRecord, 'createdAt' | 'updatedAt' | 'status'> & Partial<Pick<TransactionRecord, 'status' | 'createdAt' | 'updatedAt'>>): Promise<TransactionRecord> {
    const payload = {
      id: input.id,
      business_id: input.businessId,
      transaction_no: input.referenceNo ?? input.id,
      transaction_date: input.date,
      transaction_type: input.type,
      description: input.description,
      reference_no: input.referenceNo,
      amount: input.amount,
      currency: 'MYR',
      status: input.status ?? 'POSTED',
      source: 'MANUAL',
      financial_account_id: input.financialAccountId ?? null,
      created_by: null,
      created_at: input.createdAt ?? new Date().toISOString(),
      updated_at: input.updatedAt ?? new Date().toISOString(),
    };

    const result = await (this['client'] as any).from('transactions').upsert(payload, { onConflict: 'id' }).select().single();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase transaction insert failed.');
    }
    return result.data as TransactionRecord;
  }
}

export class SupabaseJournalRepository extends SupabaseRepositoryAdapter<JournalEntry> {
  constructor(client: SupabaseClientLike) {
    super('journal_entries', client, 'business_id');
  }

  async createPosted(input: JournalEntry & { lines: JournalLine[] }): Promise<JournalEntry> {
    const initialEntry = {
      id: input.id,
      business_id: input.businessId,
      journal_no: input.journalNo,
      journal_date: input.journalDate,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      description: input.description,
      status: 'DRAFT',
      posted_at: null,
      posted_by: null,
      created_at: input.createdAt,
    };

    const entryResult = await (this['client'] as any).from('journal_entries').upsert(initialEntry, { onConflict: 'id' }).select().single();
    if (entryResult.error) {
      throw new Error(entryResult.error.message ?? 'Supabase journal insert failed.');
    }

    const linesPayload = input.lines.map((line: JournalLine) => ({
      id: line.id,
      journal_entry_id: input.id,
      account_id: line.accountId,
      debit: line.debit ?? '0.00',
      credit: line.credit ?? '0.00',
      description: line.description ?? '',
      financial_account_id: line.financialAccountId ?? null,
      contact_id: line.contactId ?? null,
    }));

    const lineResult = await (this['client'] as any).from('journal_lines').upsert(linesPayload, { onConflict: 'id' }).select();
    if (lineResult.error) {
      throw new Error(lineResult.error.message ?? 'Supabase journal line insert failed.');
    }

    const postedResult = await (this['client'] as any)
      .from('journal_entries')
      .update({
        status: 'POSTED',
        posted_at: input.postedAt ?? new Date().toISOString(),
        posted_by: null,
      })
      .eq('id', input.id)
      .select()
      .single();

    if (postedResult.error) {
      throw new Error(postedResult.error.message ?? 'Supabase journal posting failed.');
    }

    return { ...postedResult.data, lines: lineResult.data ?? [] } as JournalEntry;
  }

  async getLedger(businessId: string): Promise<Array<{ account_id: string; debit: string; credit: string }>> {
    const scope = sanitizeBusinessId(businessId);
    const result = await (this['client'] as any)
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(business_id)')
      .eq('journal_entries.business_id', scope);

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase ledger query failed.');
    }

    return (result.data ?? []) as Array<{ account_id: string; debit: string; credit: string }>;
  }

  async getTrialBalance(businessId: string): Promise<{ totalDebit: string; totalCredit: string; rows: any[] }> {
    const scope = sanitizeBusinessId(businessId);
    const result = await (this['client'] as any)
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(business_id, status)')
      .eq('journal_entries.business_id', scope)
      .eq('journal_entries.status', 'POSTED');

    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase trial balance query failed.');
    }

    const rows = (result.data ?? []) as any[];
    const totalDebit = rows.reduce((sum, row) => sum + Number(row.debit ?? 0), 0).toFixed(2);
    const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit ?? 0), 0).toFixed(2);

    return { totalDebit, totalCredit, rows };
  }
}

export class SupabaseAccountingPeriodRepository extends SupabaseRepositoryAdapter<AccountingPeriod> {
  constructor(client: SupabaseClientLike) {
    super('accounting_periods', client, 'business_id');
  }

  async upsertByName(businessId: string, period: Omit<AccountingPeriod, 'id' | 'businessId'> & { id?: string }): Promise<AccountingPeriod> {
    const scope = sanitizeBusinessId(businessId);
    const payload = {
      id: period.id,
      business_id: scope,
      period_name: period.name,
      start_date: period.startDate,
      end_date: period.endDate,
      status: period.status,
      closed_at: period.closedAt ?? null,
      closed_by: period.closedBy ?? null,
    };

    const result = await (this['client'] as any).from('accounting_periods').upsert(payload, { onConflict: 'business_id,period_name' }).select().single();
    if (result.error) {
      throw new Error(result.error.message ?? 'Supabase accounting period upsert failed.');
    }
    return result.data as AccountingPeriod;
  }
}

export interface FinancialReportDataSource {
  getBusinessAccounts: (businessId: string) => BusinessAccount[];
  getPostedJournals: (businessId: string) => JournalEntry[];
  getAccount?: (businessId: string, accountId: string) => BusinessAccount | undefined;
}

export class SupabaseFinancialReportRepository implements FinancialReportDataSource {
  constructor(private readonly client: SupabaseClientLike) {}

  getBusinessAccounts(businessId: string): BusinessAccount[] {
    const scope = sanitizeBusinessId(businessId);
    const query = (this.client.from('accounts') as any).select('*').eq('business_id', scope);
    return (query as any).data ?? [];
  }

  getPostedJournals(businessId: string): JournalEntry[] {
    const scope = sanitizeBusinessId(businessId);
    const query = (this.client.from('journal_entries') as any)
      .select('*, journal_lines(*)')
      .eq('business_id', scope)
      .eq('status', 'POSTED');

    const rows = (query as any).data ?? [];
    return (rows ?? []).map((row: any) => ({
      id: row.id,
      businessId: row.business_id,
      journalNo: row.journal_no,
      journalDate: row.journal_date,
      sourceType: row.source_type,
      sourceId: row.source_id,
      description: row.description,
      status: row.status,
      postedAt: row.posted_at,
      postedBy: row.posted_by,
      referenceNo: row.reference_no,
      lines: (row.journal_lines ?? []).map((line: any) => ({
        id: line.id,
        journalEntryId: line.journal_entry_id,
        accountId: line.account_id,
        debit: String(line.debit ?? '0.00'),
        credit: String(line.credit ?? '0.00'),
        description: line.description,
        financialAccountId: line.financial_account_id,
        contactId: line.contact_id,
      })),
      createdAt: row.created_at,
    })) as JournalEntry[];
  }

  getAccount(businessId: string, accountId: string): BusinessAccount | undefined {
    const accounts = this.getBusinessAccounts(businessId);
    return accounts.find((account) => account.id === accountId);
  }
}

export type SupabasePersistenceClient = SupabaseClient<any, 'public'>;
