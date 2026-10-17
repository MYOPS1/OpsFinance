import { NextResponse } from 'next/server';

import { assertBusinessMembership, persistBankStatementImport, postApprovedBankImport } from '@/lib/accounting/server-operations';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

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
    const { data: statementsData, error } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const statements = Array.isArray(statementsData) ? statementsData : [];
    const statementIds = statements.map((statement: any) => statement.id);
    const { data: transactions = [], error: txnError } = await supabase
      .from('bank_transactions')
      .select('*')
      .in('bank_statement_id', statementIds.length ? statementIds : ['__none__']);

    if (txnError) {
      return NextResponse.json({ error: txnError.message }, { status: 400 });
    }

    return NextResponse.json({ statements, transactions });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Business access denied.';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    if (action === 'preview') {
      const content = String(payload.content ?? '').trim();
      const fileName = String(payload.fileName ?? 'upload.csv').trim() || 'upload.csv';
      const fileType = String(payload.fileType ?? 'text/csv').trim() || 'text/csv';

      if (!content) {
        return NextResponse.json({ error: 'Upload content is required for preview.' }, { status: 400 });
      }

      const statementResult = await persistBankStatementImport(
        supabase,
        user.id,
        businessId,
        fileName,
        content,
        fileType,
        payload.financialAccountId ?? null,
      );

      return NextResponse.json({
        ok: true,
        statementId: statementResult.statementId,
        rows: statementResult.rows,
        summary: { totalRows: statementResult.rows.length },
      });
    }

    if (action === 'approve') {
      const statementId = String(payload.statementId ?? '').trim();
      const accountId = String(payload.accountId ?? '').trim();
      const transactionType = String(payload.transactionType ?? 'JOURNAL').trim();

      if (!statementId) {
        return NextResponse.json({ error: 'A statementId is required.' }, { status: 400 });
      }

      if (!accountId) {
        return NextResponse.json({ error: 'A selected posting account is required before approval.' }, { status: 400 });
      }

      const result = await postApprovedBankImport(supabase, user.id, businessId, statementId, accountId, transactionType);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Unsupported upload action.' }, { status: 400 });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Upload processing failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
