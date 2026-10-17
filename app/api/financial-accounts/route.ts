import { NextResponse } from 'next/server';

import { resolveAuthorizedBusinessId } from '@/lib/auth/business';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const VALID_FINANCIAL_TYPES = new Set(['BANK', 'CASH', 'E_WALLET', 'CREDIT_CARD', 'LOAN', 'OTHER']);
const VALID_STATUS_VALUES = new Set(['ACTIVE', 'INACTIVE']);

async function getAuthorizedBusinessId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string, requestedBusinessId: string | null) {
  const { data: membershipRows, error: membershipError } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', userId);

  if (membershipError) {
    throw new Error(membershipError.message ?? 'Business membership lookup failed.');
  }

  return resolveAuthorizedBusinessId(userId, membershipRows ?? [], requestedBusinessId);
}

async function getFinancialAccountById(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, id: string) {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Financial account lookup failed.');
  }

  return data;
}

async function getOpeningEquityAccount(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('business_id', businessId)
    .eq('is_system', true)
    .eq('account_type', 'EQUITY')
    .order('code', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Opening equity lookup failed.');
  }

  if (!data) {
    throw new Error('No opening equity account is available for this business.');
  }

  return data;
}

function validateFinancialAccountPayload(payload: Record<string, unknown>, existing?: Record<string, unknown> | null) {
  const name = String(payload.name ?? existing?.name ?? '').trim();
  const accountCode = String(payload.accountCode ?? payload.account_code ?? existing?.account_code ?? '').trim();
  const currency = String(payload.currency ?? payload.currency_code ?? existing?.currency ?? 'MYR').trim().toUpperCase() || 'MYR';
  const type = String(payload.type ?? existing?.type ?? 'BANK').trim().toUpperCase();
  const status = String(payload.status ?? existing?.status ?? 'ACTIVE').trim().toUpperCase();
  const openingBalance = payload.openingBalance ?? payload.opening_balance ?? existing?.opening_balance ?? '0';

  if (!VALID_FINANCIAL_TYPES.has(type)) {
    throw new Error('Financial account type is invalid.');
  }

  if (!VALID_STATUS_VALUES.has(status)) {
    throw new Error('Status must be ACTIVE or INACTIVE.');
  }

  if (!name) {
    throw new Error('Financial account name is required.');
  }

  if (!accountCode) {
    throw new Error('Financial account code is required.');
  }

  return {
    name,
    type,
    accountCode,
    currency,
    status,
    openingBalance: Number(openingBalance ?? 0),
    openingBalanceDate: payload.openingBalanceDate ? String(payload.openingBalanceDate) : ((existing?.opening_balance_date as string | undefined) ?? null),
    accountId: payload.accountId ? String(payload.accountId).trim() || null : (payload.account_id ? String(payload.account_id).trim() || null : (existing?.account_id as string | null | undefined) ?? null),
  };
}

async function postOpeningBalanceJournal(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, accountId: string, amount: number, journalDate: string | null, createdBy: string) {
  if (!Number.isFinite(amount) || amount === 0) {
    return null;
  }

  const equityAccount = await getOpeningEquityAccount(supabase, businessId);
  const normalizedDate = journalDate ?? new Date().toISOString().slice(0, 10);
  const journalRef = `OB-${Date.now()}`;
  const payload = {
    p_business_id: businessId,
    p_idempotency_key: `opening_balance:${accountId}:${journalRef}`,
    p_transaction_type: 'MONEY_IN',
    p_transaction_date: normalizedDate,
    p_description: 'Opening balance',
    p_reference_no: journalRef,
    p_amount: Math.abs(amount),
    p_financial_account_id: accountId,
    p_account_id: equityAccount.id,
    p_journal_no: journalRef,
    p_journal_description: 'Opening balance',
    p_lines: [
      {
        account_id: equityAccount.id,
        credit: amount.toFixed(2),
        description: 'Opening balance',
      },
      {
        account_id: accountId,
        debit: amount.toFixed(2),
        description: 'Opening balance',
      },
    ],
  };

  const { data, error } = await supabase.rpc('post_accounting_transaction_atomic', payload);
  if (error) {
    throw new Error(error.message ?? 'Opening balance journal failed.');
  }

  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: createdBy,
    action: 'ACCOUNTING_OPENING_BALANCE_POSTED',
    entity_type: 'FINANCIAL_ACCOUNT',
    entity_id: accountId,
    metadata: { amount: Number(amount).toFixed(2), journal_ref: journalRef },
  });

  return data;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get('businessId') ?? null;
    const requestedId = searchParams.get('id') ?? null;
    const businessId = await getAuthorizedBusinessId(supabase, user.id, requestedBusinessId);

    if (requestedId) {
      const account = await getFinancialAccountById(supabase, businessId, requestedId);
      if (!account) {
        return NextResponse.json({ error: 'Financial account not found.' }, { status: 404 });
      }

      return NextResponse.json({ financialAccount: account });
    }

    const { data, error } = await supabase
      .from('financial_accounts')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ financialAccounts: data ?? [] });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Business access denied.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const businessId = await getAuthorizedBusinessId(supabase, user.id, String(payload.businessId ?? '').trim() || null);
    const validation = validateFinancialAccountPayload(payload as Record<string, unknown>);

    if (validation.accountId) {
      const { data: accountRow, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', validation.accountId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (accountError) {
        return NextResponse.json({ error: accountError.message }, { status: 400 });
      }

      if (!accountRow) {
        return NextResponse.json({ error: 'Chart-of-accounts mapping is not valid for this business.' }, { status: 400 });
      }
    }

    const { data: duplicateRow, error: duplicateError } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('account_code', validation.accountCode)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    }

    if (duplicateRow) {
      return NextResponse.json({ error: `Financial account code ${validation.accountCode} already exists.` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('financial_accounts')
      .insert({
        business_id: businessId,
        name: validation.name,
        type: validation.type,
        account_code: validation.accountCode,
        currency: validation.currency,
        opening_balance: validation.openingBalance,
        opening_balance_date: validation.openingBalanceDate,
        status: validation.status,
        account_id: validation.accountId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const openingJournal = await postOpeningBalanceJournal(supabase, businessId, data.id, validation.openingBalance, validation.openingBalanceDate ?? null, user.id);

    return NextResponse.json({ financialAccount: data, openingJournal });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Business access denied.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const targetId = String(payload.id ?? '').trim();
    const businessId = await getAuthorizedBusinessId(supabase, user.id, String(payload.businessId ?? '').trim() || null);

    if (!targetId) {
      return NextResponse.json({ error: 'Financial account id is required.' }, { status: 400 });
    }

    const existing = await getFinancialAccountById(supabase, businessId, targetId);
    if (!existing) {
      return NextResponse.json({ error: 'Financial account not found.' }, { status: 404 });
    }

    const validation = validateFinancialAccountPayload(payload as Record<string, unknown>, existing);

    if (validation.accountId) {
      const { data: accountRow, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', validation.accountId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (accountError) {
        return NextResponse.json({ error: accountError.message }, { status: 400 });
      }

      if (!accountRow) {
        return NextResponse.json({ error: 'Chart-of-accounts mapping is not valid for this business.' }, { status: 400 });
      }
    }

    const { data: duplicateRow, error: duplicateError } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('account_code', validation.accountCode)
      .neq('id', targetId)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    }

    if (duplicateRow) {
      return NextResponse.json({ error: `Financial account code ${validation.accountCode} already exists.` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('financial_accounts')
      .update({
        name: validation.name,
        type: validation.type,
        account_code: validation.accountCode,
        currency: validation.currency,
        status: validation.status,
        opening_balance: validation.openingBalance,
        opening_balance_date: validation.openingBalanceDate,
        account_id: validation.accountId,
      })
      .eq('id', targetId)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ financialAccount: data });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to update financial account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
