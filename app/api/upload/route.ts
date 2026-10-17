import { NextResponse } from 'next/server';

import { assertBusinessMembership, persistBankStatementImport, postApprovedBankImport } from '@/lib/accounting/server-operations';
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
    const { data: statements, error } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const statementIds = (statements ?? []).map((statement: any) => statement.id);
    const { data: transactions = [], error: txnError } = await supabase
      .from('bank_transactions')
      .select('*')
      .in('bank_statement_id', statementIds.length > 0 ? statementIds : ['__none__']);

    if (txnError) {
      return NextResponse.json({ error: txnError.message }, { status: 400 });
    }

    return NextResponse.json({ statements: statements ?? [], transactions: transactions ?? [] });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Business access denied.';
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
    const action = String(payload.action ?? 'preview').trim();

    if (!businessId) {
      return NextResponse.json({ error: 'A businessId is required.' }, { status: 400 });
    }

    await assertBusinessMembership(supabase, user.id, businessId);

    if (action === 'preview') {
      const content = String(payload.content ?? '');
      const fileName = String(payload.fileName ?? 'upload.csv').trim() || 'upload.csv';
      const fileType = String(payload.fileType ?? 'text/csv').trim() || 'text/csv';
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

    if (action === 'approve' || action === 'post') {
      const statementId = String(payload.statementId ?? '').trim();
      if (!statementId) {
        return NextResponse.json({ error: 'A statementId is required.' }, { status: 400 });
      }

      const rowsPayload = Array.isArray(payload.rows) ? payload.rows : [];
      const rows = rowsPayload.map((row: any) => ({
        id: String(row.id ?? crypto.randomUUID()),
        date: String(row.date ?? ''),
        description: String(row.description ?? ''),
        reference: String(row.reference ?? ''),
        amount: String(row.amount ?? '0.00'),
        debit: String(row.debit ?? '0.00'),
        credit: String(row.credit ?? '0.00'),
        balance: String(row.balance ?? '0.00'),
        direction: row.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
      }));

      if (rows.length === 0) {
        return NextResponse.json({ error: 'No uploaded rows are available to approve.' }, { status: 400 });
      }

      const result = await postApprovedBankImport(
        supabase,
        user.id,
        businessId,
        statementId,
        rows,
        payload.financialAccountId ?? null,
      );

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Unsupported upload action.' }, { status: 400 });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Upload processing failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
