import { createDeterministicHash, parseCsvRow, validateCsvBankStatement } from '@/packages/csv-import';

export type UnifiedBankRow = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: string;
  debit: string;
  credit: string;
  balance: string;
  direction: 'DEBIT' | 'CREDIT';
};

export async function assertBusinessMembership(
  supabase: any,
  userId: string,
  businessId: string,
): Promise<void> {
  if (!userId || !businessId) {
    throw new Error('Business access denied.');
  }

  const { data, error } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Business membership verification failed.');
  }

  if (!data) {
    throw new Error('Business access denied.');
  }
}

export function normalizeBankCsvRows(csvText: string): UnifiedBankRow[] {
  const validation = validateCsvBankStatement(csvText);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(' '));
  }

  const rows = validation.rows.slice(1);
  return rows.map((rowText, index) => {
    const values = parseCsvRow(rowText);
    const header = validation.header;
    const record = Object.fromEntries(header.map((key, columnIndex) => [key.trim().toLowerCase(), values[columnIndex] ?? '']));
    const date = String(record.date ?? record.transactiondate ?? '').trim();
    const description = String(record.description ?? record.narration ?? `Statement row ${index + 1}`).trim();
    const reference = String(record.reference ?? record.reference_no ?? record.invoice ?? record['transaction id'] ?? `${index + 1}`).trim();
    const rawDebit = String(record.debit ?? '').trim();
    const rawCredit = String(record.credit ?? '').trim();
    const amount = String(record.amount ?? (rawDebit || rawCredit || '0.00')).trim();
    const debit = rawDebit || (Number(amount) < 0 ? Math.abs(Number(amount)).toFixed(2) : '0.00');
    const credit = rawCredit || (Number(amount) > 0 ? Math.abs(Number(amount)).toFixed(2) : '0.00');
    const normalizedAmount = ((Number(amount) || 0) * 100) / 100;

    return {
      id: `bank-row-${index + 1}-${createDeterministicHash(`${date}|${description}|${reference}|${amount}`)}`,
      date,
      description,
      reference,
      amount: normalizedAmount.toFixed(2),
      debit: Number(debit || '0').toFixed(2),
      credit: Number(credit || '0').toFixed(2),
      balance: String(record.balance ?? normalizedAmount.toFixed(2)),
      direction: Number(debit || '0') > 0 ? 'DEBIT' : 'CREDIT',
    };
  });
}

export async function resolveFinancialAccountId(
  supabase: any,
  businessId: string,
  preferredFinancialAccountId?: string | null,
): Promise<string> {
  if (preferredFinancialAccountId) {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('id', preferredFinancialAccountId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? 'Financial account lookup failed.');
    }

    if (data) {
      return data.id;
    }
  }

  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id')
    .eq('business_id', businessId)
    .eq('status', 'ACTIVE')
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Financial account lookup failed.');
  }

  if (!data) {
    throw new Error('No active financial account is available for this business.');
  }

  return data.id;
}

export async function getDefaultBusinessAccounts(
  supabase: any,
  businessId: string,
): Promise<{ cashAccountId: string; revenueAccountId: string; expenseAccountId: string }> {
  const [cashResult, revenueResult, expenseResult] = await Promise.all([
    supabase.from('accounts').select('id').eq('business_id', businessId).eq('code', '1100').maybeSingle(),
    supabase.from('accounts').select('id').eq('business_id', businessId).eq('code', '4000').maybeSingle(),
    supabase.from('accounts').select('id').eq('business_id', businessId).eq('code', '6000').maybeSingle(),
  ]);

  const cashAccountId = cashResult?.data?.id;
  const revenueAccountId = revenueResult?.data?.id;
  const expenseAccountId = expenseResult?.data?.id;

  if (!cashAccountId || !revenueAccountId || !expenseAccountId) {
    throw new Error('Business chart of accounts is incomplete for upload posting.');
  }

  return { cashAccountId, revenueAccountId, expenseAccountId };
}

export async function persistBankStatementImport(
  supabase: any,
  userId: string,
  businessId: string,
  fileName: string,
  content: string,
  fileType: string,
  financialAccountId?: string | null,
): Promise<{ statementId: string; rows: UnifiedBankRow[]; bankTransactions: Array<{ id: string; bank_statement_id: string; reference: string; amount: string; debit: string; credit: string; status: string }> }> {
  await assertBusinessMembership(supabase, userId, businessId);
  const rows = normalizeBankCsvRows(content);
  const resolvedFinancialAccountId = await resolveFinancialAccountId(supabase, businessId, financialAccountId);
  const statementId = crypto.randomUUID();
  const now = new Date().toISOString();

  const statementInsert = await supabase
    .from('bank_statements')
    .insert({
      id: statementId,
      business_id: businessId,
      financial_account_id: resolvedFinancialAccountId,
      file_name: fileName,
      file_type: fileType,
      statement_start_date: rows[0]?.date ? rows[0].date : null,
      statement_end_date: rows[rows.length - 1]?.date ? rows[rows.length - 1].date : null,
      opening_balance: '0.00',
      closing_balance: '0.00',
      status: 'IMPORTED',
      uploaded_by: userId,
      created_at: now,
    })
    .select();

  if (statementInsert.error) {
    throw new Error(statementInsert.error.message ?? 'Unable to create bank statement record.');
  }

  const bankTransactions = rows.map((row, index) => ({
    id: crypto.randomUUID(),
    bank_statement_id: statementId,
    transaction_date: row.date,
    description: row.description,
    reference: row.reference,
    amount: row.amount,
    debit: row.debit,
    credit: row.credit,
    running_balance: String(row.balance ?? '0.00'),
    normalized_description: row.description.toLowerCase(),
    status: 'IMPORTED',
    order_index: index,
  }));

  const insertResult = await supabase.from('bank_transactions').insert(
    bankTransactions.map((row) => ({
      id: row.id,
      bank_statement_id: row.bank_statement_id,
      transaction_date: row.transaction_date,
      description: row.description,
      reference: row.reference,
      amount: row.amount,
      debit: row.debit,
      credit: row.credit,
      running_balance: row.running_balance,
      normalized_description: row.normalized_description,
      status: row.status,
    })),
  ).select();

  if (insertResult.error) {
    throw new Error(insertResult.error.message ?? 'Unable to insert bank transactions.');
  }

  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'UPLOAD_IMPORTED',
    entity_type: 'BANK_STATEMENT',
    entity_id: statementId,
    metadata: { file_name: fileName, transaction_count: rows.length },
  });

  return { statementId, rows, bankTransactions: insertResult.data ?? bankTransactions };
}

export async function postApprovedBankImport(
  supabase: any,
  userId: string,
  businessId: string,
  statementId: string,
  rows: UnifiedBankRow[],
  financialAccountId?: string | null,
): Promise<{ posted: Array<{ id: string; amount: string; status: string }>; summary: { totalAmount: string; postedCount: number } }> {
  await assertBusinessMembership(supabase, userId, businessId);
  const { cashAccountId, revenueAccountId, expenseAccountId } = await getDefaultBusinessAccounts(supabase, businessId);
  const resolvedFinancialAccountId = await resolveFinancialAccountId(supabase, businessId, financialAccountId);

  const posted: Array<{ id: string; amount: string; status: string }> = [];

  for (const row of rows) {
    const amount = row.debit || row.credit || '0.00';
    const isMoneyIn = row.direction === 'CREDIT';
    const lines = isMoneyIn
      ? [
          { account_id: revenueAccountId, credit: amount, description: row.description, financial_account_id: resolvedFinancialAccountId },
          { account_id: cashAccountId, debit: amount, description: row.description, financial_account_id: resolvedFinancialAccountId },
        ]
      : [
          { account_id: expenseAccountId, debit: amount, description: row.description, financial_account_id: resolvedFinancialAccountId },
          { account_id: cashAccountId, credit: amount, description: row.description, financial_account_id: resolvedFinancialAccountId },
        ];

    const idempotencyKey = `upload:${businessId}:${statementId}:${row.reference || row.id}`;
    const result = await supabase.rpc('post_accounting_transaction_atomic', {
      p_business_id: businessId,
      p_idempotency_key: idempotencyKey,
      p_transaction_type: isMoneyIn ? 'MONEY_IN' : 'MONEY_OUT',
      p_transaction_date: row.date,
      p_description: row.description,
      p_reference_no: row.reference || row.id,
      p_amount: amount,
      p_financial_account_id: resolvedFinancialAccountId,
      p_account_id: isMoneyIn ? revenueAccountId : expenseAccountId,
      p_journal_no: `UP-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      p_journal_description: row.description,
      p_lines: lines,
    });

    if (result.error) {
      throw new Error(result.error.message ?? 'Unable to post uploaded transaction.');
    }

    posted.push({ id: `${row.id}-posted`, amount, status: result.data?.status ?? 'POSTED' });
  }

  await supabase.from('bank_statements').update({ status: 'MATCHED' }).eq('id', statementId).eq('business_id', businessId);
  await supabase.from('bank_transactions').update({ status: 'MATCHED' }).eq('bank_statement_id', statementId);
  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'UPLOAD_APPROVED',
    entity_type: 'BANK_STATEMENT',
    entity_id: statementId,
    metadata: { rows_posted: posted.length },
  });

  return {
    posted,
    summary: {
      totalAmount: rows.reduce((sum, row) => sum + Number(row.amount || '0.00'), 0).toFixed(2),
      postedCount: posted.length,
    },
  };
}

export async function getReconciliationSnapshot(
  supabase: any,
  businessId: string,
): Promise<{ statements: any[]; bankTransactions: any[]; bookTransactions: any[]; matches: any[]; summary: { matched: number; unmatchedBank: number; unmatchedBook: number; difference: string } }> {
  const { data: statements = [], error: statementError } = await supabase
    .from('bank_statements')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (statementError) throw new Error(statementError.message ?? 'Unable to load bank statements.');

  const statementIds = statements.map((statement: any) => statement.id);
  const [{ data: bankTransactions = [] }, { data: bookTransactions = [] }, { data: matches = [] }] = await Promise.all([
    supabase.from('bank_transactions').select('*').in('bank_statement_id', statementIds.length ? statementIds : ['__none__']),
    supabase.from('transactions').select('*').eq('business_id', businessId).eq('status', 'POSTED').order('transaction_date', { ascending: false }),
    supabase.from('reconciliation_matches').select('*').eq('business_id', businessId),
  ]);

  const unmatchedBank = (bankTransactions as any[]).filter((transaction: any) => transaction.status !== 'MATCHED').length;
  const matched = (matches as any[]).length;
  const summary = {
    matched,
    unmatchedBank,
    unmatchedBook: Math.max(0, (bookTransactions as any[]).length - matched),
    difference: (
      Number((bankTransactions as any[]).reduce((sum: number, row: any) => sum + Number(row.amount || '0.00'), 0)) -
      Number((bookTransactions as any[]).reduce((sum: number, row: any) => sum + Number(row.amount || '0.00'), 0))
    ).toFixed(2),
  };

  return { statements, bankTransactions, bookTransactions, matches, summary };
}

export async function createReconciliationMatch(
  supabase: any,
  userId: string,
  businessId: string,
  bankTransactionId: string,
  transactionId: string,
  matchedAmount: string,
): Promise<{ matchId: string }> {
  await assertBusinessMembership(supabase, userId, businessId);

  const bankTransaction = await supabase
    .from('bank_transactions')
    .select('id, bank_statement_id')
    .eq('id', bankTransactionId)
    .maybeSingle();

  const transaction = await supabase
    .from('transactions')
    .select('id')
    .eq('id', transactionId)
    .eq('business_id', businessId)
    .eq('status', 'POSTED')
    .maybeSingle();

  if (bankTransaction.error || transaction.error || !bankTransaction.data || !transaction.data) {
    throw new Error('The selected bank and book transactions are not valid for this business.');
  }

  const result = await supabase.from('reconciliation_matches').insert({
    business_id: businessId,
    bank_transaction_id: bankTransactionId,
    transaction_id: transactionId,
    matched_amount: matchedAmount,
    match_type: 'MANUAL',
    matched_by: userId,
    matched_at: new Date().toISOString(),
  }).select().single();

  if (result.error) {
    throw new Error(result.error.message ?? 'Unable to save the reconciliation match.');
  }

  await supabase.from('bank_transactions').update({ status: 'MATCHED' }).eq('id', bankTransactionId);
  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'RECONCILIATION_MATCHED',
    entity_type: 'BANK_TRANSACTION',
    entity_id: bankTransactionId,
    metadata: { transaction_id: transactionId, matched_amount: matchedAmount },
  });

  return { matchId: result.data.id };
}

export async function completeReconciliation(
  supabase: any,
  userId: string,
  businessId: string,
  statementId: string,
): Promise<{ status: string }> {
  await assertBusinessMembership(supabase, userId, businessId);

  const { data: bankTransactions = [], error: statementLoadError } = await supabase
    .from('bank_transactions')
    .select('id, status')
    .eq('bank_statement_id', statementId);

  if (statementLoadError) throw new Error(statementLoadError.message ?? 'Unable to load outstanding bank transactions.');

  if ((bankTransactions as any[]).some((row: any) => row.status !== 'MATCHED')) {
    throw new Error('Reconciliation cannot be finalized while mandatory exceptions remain unresolved.');
  }

  const update = await supabase.from('bank_statements').update({ status: 'MATCHED' }).eq('id', statementId).eq('business_id', businessId);
  if (update.error) throw new Error(update.error.message ?? 'Unable to finalize reconciliation.');

  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'RECONCILIATION_COMPLETED',
    entity_type: 'BANK_STATEMENT',
    entity_id: statementId,
    metadata: { status: 'MATCHED' },
  });

  return { status: 'COMPLETED' };
}
