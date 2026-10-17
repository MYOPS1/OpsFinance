import { NextResponse } from 'next/server';

import { assertBusinessMembership, completeReconciliation, createReconciliationMatch, getReconciliationSnapshot } from '@/lib/accounting/server-operations';
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
  const businessId = searchParams.get('businessId');
  if (!businessId) {
    return NextResponse.json({ error: 'A businessId is required.' }, { status: 400 });
  }

  try {
    await assertBusinessMembership(supabase, user.id, businessId);
    const data = await getReconciliationSnapshot(supabase, businessId);
    return NextResponse.json({ ok: true, ...data });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Reconciliation access denied.';
    return NextResponse.json({ error: message }, { status: 403 });
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
    const businessId = String(payload.businessId ?? '').trim();
    const action = String(payload.action ?? '').trim();

    if (!businessId) {
      return NextResponse.json({ error: 'A businessId is required.' }, { status: 400 });
    }

    await assertBusinessMembership(supabase, user.id, businessId);

    if (action === 'match') {
      const bankTransactionId = String(payload.bankTransactionId ?? '').trim();
      const transactionId = String(payload.transactionId ?? '').trim();
      const matchedAmount = String(payload.matchedAmount ?? '0.00').trim();

      if (!bankTransactionId || !transactionId) {
        return NextResponse.json({ error: 'Bank and book transaction IDs are required.' }, { status: 400 });
      }

      const result = await createReconciliationMatch(
        supabase,
        user.id,
        businessId,
        bankTransactionId,
        transactionId,
        matchedAmount,
      );

      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'complete') {
      const statementId = String(payload.statementId ?? '').trim();
      if (!statementId) {
        return NextResponse.json({ error: 'A statementId is required.' }, { status: 400 });
      }

      const result = await completeReconciliation(supabase, user.id, businessId, statementId);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Unsupported reconciliation action.' }, { status: 400 });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Reconciliation processing failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
