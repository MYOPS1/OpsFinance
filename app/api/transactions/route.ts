import { NextResponse } from 'next/server';

import { resolveAuthorizedBusinessId, resolveBusinessContextForUser } from '@/lib/auth/business';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedBusinessId = searchParams.get('businessId');
  const context = await resolveBusinessContextForUser(supabase, user.id, requestedBusinessId);

  if (!context || context.state !== 'BUSINESS_CONTEXT_READY') {
    return NextResponse.json({ error: context?.state === 'NO_BUSINESS' ? 'NO_BUSINESS' : 'UNAUTHORIZED_BUSINESS' }, { status: 403 });
  }

  const businessId = context.businessId;

  const [accountsResult, financialAccountsResult, transactionsResult] = await Promise.all([
    supabase.from('accounts').select('*').eq('business_id', businessId).order('code', { ascending: true }),
    supabase.from('financial_accounts').select('*').eq('business_id', businessId).order('name', { ascending: true }),
    supabase.from('transactions').select('*').eq('business_id', businessId).order('transaction_date', { ascending: false }).limit(20),
  ]);

  if (accountsResult.error) {
    return NextResponse.json({ error: accountsResult.error.message }, { status: 400 });
  }

  if (financialAccountsResult.error) {
    return NextResponse.json({ error: financialAccountsResult.error.message }, { status: 400 });
  }

  if (transactionsResult.error) {
    return NextResponse.json({ error: transactionsResult.error.message }, { status: 400 });
  }

  return NextResponse.json({
    accounts: accountsResult.data ?? [],
    financialAccounts: financialAccountsResult.data ?? [],
    transactions: transactionsResult.data ?? [],
  });
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

  const payload = await request.json().catch(() => ({}));
  const requestedBusinessId = String(payload.businessId ?? payload.p_business_id ?? '').trim();

  const { data: membershipRows, error: membershipError } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const businessId = resolveAuthorizedBusinessId(user.id, membershipRows ?? [], requestedBusinessId);

  const accountId = String(payload.account_id ?? payload.p_account_id ?? '').trim();
  const financialAccountId = String(payload.financial_account_id ?? payload.p_financial_account_id ?? '').trim();

  if (accountId) {
    const { data: accountRow, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!accountRow) {
      return NextResponse.json({ error: 'General ledger account is not valid for this business.' }, { status: 400 });
    }
  }

  if (financialAccountId) {
    const { data: financialRow, error: financialError } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('id', financialAccountId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (financialError) {
      return NextResponse.json({ error: financialError.message }, { status: 400 });
    }

    if (!financialRow) {
      return NextResponse.json({ error: 'Financial account is not valid for this business.' }, { status: 400 });
    }
  }

  const rpcPayload = {
    p_business_id: businessId,
    p_idempotency_key: payload.idempotency_key ?? payload.p_idempotency_key ?? `server-${Date.now()}`,
    p_transaction_type: payload.type ?? payload.p_transaction_type ?? 'MONEY_IN',
    p_transaction_date: payload.date ?? payload.p_transaction_date ?? new Date().toISOString().slice(0, 10),
    p_description: payload.description ?? payload.p_description ?? 'Server-posted transaction',
    p_reference_no: payload.reference_no ?? payload.p_reference_no ?? `SRV-${Date.now()}`,
    p_amount: Number(payload.amount ?? payload.p_amount ?? 0),
    p_financial_account_id: financialAccountId,
    p_account_id: accountId,
    p_journal_no: payload.journal_no ?? payload.p_journal_no ?? `SRV-${Date.now()}`,
    p_journal_description: payload.journal_description ?? payload.p_journal_description ?? payload.description ?? payload.p_description ?? 'Server-posted transaction',
    p_lines: payload.lines ?? payload.p_lines ?? [
      {
        account_id: accountId,
        debit: payload.type === 'MONEY_OUT' ? String(payload.amount ?? '0.00') : '0.00',
        credit: payload.type === 'MONEY_IN' ? String(payload.amount ?? '0.00') : '0.00',
        description: payload.description ?? payload.p_description ?? 'Server-posted transaction',
      },
      {
        account_id: financialAccountId,
        debit: payload.type === 'MONEY_IN' ? String(payload.amount ?? '0.00') : '0.00',
        credit: payload.type === 'MONEY_OUT' ? String(payload.amount ?? '0.00') : '0.00',
        description: payload.description ?? payload.p_description ?? 'Server-posted transaction',
      },
    ],
  };

  const { data, error: rpcError } = await supabase.rpc('post_accounting_transaction_atomic', rpcPayload);

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({ transaction: data ?? null });
}
