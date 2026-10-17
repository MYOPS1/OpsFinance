import { NextResponse } from 'next/server';

import { resolveAuthorizedBusinessId } from '@/lib/auth/business';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const VALID_ACCOUNT_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE']);
const NORMAL_BALANCE_BY_TYPE = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  COGS: 'DEBIT',
  EXPENSE: 'DEBIT',
} as const;

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

async function getAccountById(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, id: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Account lookup failed.');
  }

  return data;
}

function validateAccountPayload(payload: Record<string, unknown>, existingAccount?: Record<string, unknown> | null) {
  const accountType = String(payload.account_type ?? payload.accountType ?? existingAccount?.account_type ?? '').trim();
  const normalBalance = String(payload.normal_balance ?? payload.normalBalance ?? existingAccount?.normal_balance ?? '').trim();
  const code = String(payload.code ?? existingAccount?.code ?? '').trim();
  const name = String(payload.name ?? existingAccount?.name ?? '').trim();

  if (!VALID_ACCOUNT_TYPES.has(accountType)) {
    throw new Error('Account type is invalid.');
  }

  const expectedNormalBalance = NORMAL_BALANCE_BY_TYPE[accountType as keyof typeof NORMAL_BALANCE_BY_TYPE];
  if (normalBalance && normalBalance !== expectedNormalBalance) {
    throw new Error('Normal balance does not match the account type.');
  }

  if (!code) {
    throw new Error('Account code is required.');
  }

  if (!name) {
    throw new Error('Account name is required.');
  }

  return {
    accountType,
    normalBalance: normalBalance || expectedNormalBalance,
    code,
    name,
  };
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
    const requestedBusinessId = searchParams.get('businessId');
    const requestedId = searchParams.get('id');
    const businessId = await getAuthorizedBusinessId(supabase, user.id, requestedBusinessId);

    if (requestedId) {
      const account = await getAccountById(supabase, businessId, requestedId);
      if (!account) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }

      return NextResponse.json({ account });
    }

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('business_id', businessId)
      .order('code', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ accounts: data ?? [] });
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
    const requestedBusinessId = String(payload.businessId ?? payload.business_id ?? '').trim() || null;
    const businessId = await getAuthorizedBusinessId(supabase, user.id, requestedBusinessId);

    const parentId = payload.parent_id ? String(payload.parent_id).trim() || null : (payload.parentId ? String(payload.parentId).trim() || null : null);
    const validation = validateAccountPayload(payload as Record<string, unknown>);

    if (parentId) {
      const { data: parentRow, error: parentError } = await supabase
        .from('accounts')
        .select('id, account_type, business_id')
        .eq('id', parentId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (parentError) {
        return NextResponse.json({ error: parentError.message }, { status: 400 });
      }

      if (!parentRow) {
        return NextResponse.json({ error: 'Parent account is not valid for this business.' }, { status: 400 });
      }

      if (parentRow.account_type !== validation.accountType) {
        throw new Error('Parent account type must match the child account type.');
      }
    }

    const { data: existingCode, error: duplicateError } = await supabase
      .from('accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('code', validation.code)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    }

    if (existingCode) {
      return NextResponse.json({ error: `Account code ${validation.code} already exists.` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        business_id: businessId,
        code: validation.code,
        name: validation.name,
        account_type: validation.accountType,
        normal_balance: validation.normalBalance,
        parent_id: parentId,
        is_system: Boolean(payload.is_system ?? payload.isSystem ?? false),
        is_active: payload.is_active ?? payload.isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ account: data });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to create account.';
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
    const requestedBusinessId = String(payload.businessId ?? payload.business_id ?? '').trim() || null;
    const targetId = String(payload.id ?? '').trim();
    if (!targetId) {
      return NextResponse.json({ error: 'Account id is required.' }, { status: 400 });
    }

    const businessId = await getAuthorizedBusinessId(supabase, user.id, requestedBusinessId);
    const existing = await getAccountById(supabase, businessId, targetId);
    if (!existing) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    if (existing.is_system) {
      return NextResponse.json({ error: 'System accounts are protected from unsafe modification.' }, { status: 403 });
    }

    const validation = validateAccountPayload(payload as Record<string, unknown>, existing);
    const parentId = payload.parent_id !== undefined ? (payload.parent_id ? String(payload.parent_id).trim() : null) : (payload.parentId !== undefined ? (payload.parentId ? String(payload.parentId).trim() : null) : existing.parent_id);

    if (parentId && parentId !== existing.parent_id) {
      const { data: parentRow, error: parentError } = await supabase
        .from('accounts')
        .select('id, account_type, business_id')
        .eq('id', parentId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (parentError) {
        return NextResponse.json({ error: parentError.message }, { status: 400 });
      }

      if (!parentRow) {
        return NextResponse.json({ error: 'Parent account is not valid for this business.' }, { status: 400 });
      }

      if (parentRow.account_type !== validation.accountType) {
        throw new Error('Parent account type must match the child account type.');
      }
    }

    const { data: duplicateRow, error: duplicateError } = await supabase
      .from('accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('code', validation.code)
      .neq('id', targetId)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    }

    if (duplicateRow) {
      return NextResponse.json({ error: `Account code ${validation.code} already exists.` }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('accounts')
      .update({
        code: validation.code,
        name: validation.name,
        account_type: validation.accountType,
        normal_balance: validation.normalBalance,
        parent_id: parentId,
        is_active: payload.is_active ?? payload.isActive ?? existing.is_active,
      })
      .eq('id', targetId)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ account: data });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to update account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
