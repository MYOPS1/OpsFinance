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

function assertValidMoney(value: string | number | null | undefined, fieldName: string): number {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return 0;
  }

  const normalized = raw.replace(/,/g, '').trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid currency value.`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid currency value.`);
  }

  return Number(Math.abs(parsed).toFixed(2));
}

export function validateApprovedBankRow(row: Partial<UnifiedBankRow>): { amount: string; debit: string; credit: string; direction: 'DEBIT' | 'CREDIT' } {
  const debit = assertValidMoney(row.debit ?? '0.00', 'Bank row debit');
  const credit = assertValidMoney(row.credit ?? '0.00', 'Bank row credit');
  const explicitAmount = String(row.amount ?? '').trim();
  const fallbackAmount = debit > 0 ? debit : credit > 0 ? credit : 0;
  const rawAmount = assertValidMoney(explicitAmount && Number(explicitAmount) > 0 ? explicitAmount : fallbackAmount.toFixed(2), 'Bank row amount');

  if (rawAmount <= 0) {
    throw new Error('Bank statement rows must contain a positive amount.');
  }

  if (debit > 0 && credit > 0) {
    throw new Error('Bank statement rows cannot contain both debit and credit values.');
  }

  const expectedDebit = debit > 0 ? debit : 0;
  const expectedCredit = credit > 0 ? credit : 0;
  const effectiveAmount = expectedDebit > 0 ? expectedDebit : expectedCredit;

  if (!effectiveAmount || effectiveAmount !== Number(rawAmount.toFixed(2))) {
    throw new Error('Bank statement row amount and debit/credit values do not match.');
  }

  if (expectedDebit === 0 && expectedCredit === 0) {
    throw new Error('Bank statement rows must include either a debit or a credit value.');
  }

  const direction = expectedDebit > 0 ? 'DEBIT' : 'CREDIT';

  return {
    amount: rawAmount.toFixed(2),
    debit: expectedDebit.toFixed(2),
    credit: expectedCredit.toFixed(2),
    direction,
  };
}

export function buildPostingLinesForAccount(
  account: { id: string; account_type?: string; normal_balance?: string; normalBalance?: string },
  cashAccountId: string,
  amount: string,
  description: string,
  bankDirection: 'DEBIT' | 'CREDIT' = 'DEBIT',
): Array<{ account_id: string; debit: string; credit: string; description: string }> {
  const amountValue = assertValidMoney(amount, 'Posting amount');
  const normalizedType = String(account?.account_type ?? account?.normal_balance ?? '').toUpperCase();
  const normalBalance = String(account?.normal_balance ?? account?.normalBalance ?? '').toUpperCase();
  const usesCreditNormalBalance = normalBalance === 'CREDIT' || normalizedType === 'REVENUE' || normalizedType === 'LIABILITY' || normalizedType === 'EQUITY';
  const accountSide = usesCreditNormalBalance ? (bankDirection === 'DEBIT' ? 'CREDIT' : 'DEBIT') : 'DEBIT';
  const cashSide = accountSide === 'DEBIT' ? 'CREDIT' : 'DEBIT';

  const buildLine = (targetAccountId: string, targetSide: 'DEBIT' | 'CREDIT') => ({
    account_id: targetAccountId,
    debit: targetSide === 'DEBIT' ? amountValue.toFixed(2) : '0.00',
    credit: targetSide === 'CREDIT' ? amountValue.toFixed(2) : '0.00',
    description,
  });

  return [
    buildLine(account.id, accountSide),
    buildLine(cashAccountId, cashSide),
  ];
}

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
    const rawAmountInput = String(record.amount ?? '').trim();

    const debitAmount = rawDebit ? assertValidMoney(rawDebit, 'Bank row debit') : 0;
    const creditAmount = rawCredit ? assertValidMoney(rawCredit, 'Bank row credit') : 0;
    const fallbackAmount = debitAmount > 0 ? debitAmount.toFixed(2) : creditAmount > 0 ? creditAmount.toFixed(2) : '0.00';
    const rawAmount = rawAmountInput && Number(rawAmountInput) > 0 ? rawAmountInput : fallbackAmount;
    const amountValue = assertValidMoney(rawAmount, 'Bank row amount');

    if ((debitAmount > 0 && creditAmount > 0) || (debitAmount === 0 && creditAmount === 0)) {
      throw new Error(`Bank statement row ${index + 1} must include exactly one side of the transaction.`);
    }

    if (amountValue <= 0) {
      throw new Error(`Bank statement row ${index + 1} has an invalid or zero amount.`);
    }

    const effectiveDebit = debitAmount > 0 ? debitAmount : 0;
    const effectiveCredit = creditAmount > 0 ? creditAmount : 0;
    const combined = effectiveDebit + effectiveCredit;
    if (combined !== amountValue) {
      throw new Error(`Bank statement row ${index + 1} contains an inconsistent debit/credit amount.`);
    }

    const direction: 'DEBIT' | 'CREDIT' = effectiveDebit > 0 ? 'DEBIT' : 'CREDIT';
    return {
      id: `bank-row-${index + 1}-${createDeterministicHash(`${date}|${description}|${reference}|${amountValue.toFixed(2)}`)}`,
      date,
      description,
      reference,
      amount: amountValue.toFixed(2),
      debit: effectiveDebit.toFixed(2),
      credit: effectiveCredit.toFixed(2),
      balance: String(record.balance ?? amountValue.toFixed(2)),
      direction,
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

  const lowerFileName = String(fileName ?? '').toLowerCase();
  const normalizedType = String(fileType ?? '').toLowerCase();
  const isSupportedCsv = normalizedType.includes('csv') || normalizedType.includes('text/plain') || lowerFileName.endsWith('.csv') || lowerFileName.endsWith('.txt');
  if (!isSupportedCsv) {
    throw new Error('Unsupported upload format. CSV and TXT bank statements are supported.');
  }

  const rows = normalizeBankCsvRows(content);
  const resolvedFinancialAccountId = await resolveFinancialAccountId(supabase, businessId, financialAccountId);
  const statementId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: statementError } = await supabase.from('bank_statements').insert({
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
  });

  if (statementError) {
    throw new Error(statementError.message ?? 'Unable to create bank statement record.');
  }

  const bankTransactions = rows.map((row, index) => ({
    id: row.id,
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

  const { error: insertError, data: insertedRows } = await supabase.from('bank_transactions').insert(
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

  if (insertError) {
    throw new Error(insertError.message ?? 'Unable to insert bank transactions.');
  }

  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'UPLOAD_IMPORTED',
    entity_type: 'BANK_STATEMENT',
    entity_id: statementId,
    metadata: { file_name: fileName, transaction_count: rows.length },
  });

  return { statementId, rows, bankTransactions: insertedRows ?? bankTransactions };
}

export async function postApprovedBankImport(
  supabase: any,
  userId: string,
  businessId: string,
  statementId: string,
  accountId: string,
  transactionType: string = 'JOURNAL',
): Promise<{ posted: Array<{ id: string; amount: string; status: string }>; summary: { totalAmount: string; postedCount: number } }> {
  await assertBusinessMembership(supabase, userId, businessId);

  const statementQuery = await supabase
    .from('bank_statements')
    .select('id, business_id, status, financial_account_id')
    .eq('id', statementId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (statementQuery.error) {
    throw new Error(statementQuery.error.message ?? 'Unable to load the selected bank statement.');
  }

  if (!statementQuery.data) {
    throw new Error('The selected bank statement does not belong to this business.');
  }

  if (!['IMPORTED', 'UNMATCHED'].includes(statementQuery.data.status)) {
    throw new Error('Statement approval is not allowed in the current status.');
  }

  const accountQuery = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (accountQuery.error) {
    throw new Error(accountQuery.error.message ?? 'Unable to validate the selected posting account.');
  }

  if (!accountQuery.data) {
    throw new Error('The selected posting account is invalid for this business.');
  }

  const { cashAccountId } = await getDefaultBusinessAccounts(supabase, businessId);
  const { data: bankRows = [], error: bankRowError } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('bank_statement_id', statementId)
    .order('transaction_date', { ascending: true });

  if (bankRowError) {
    throw new Error(bankRowError.message ?? 'Unable to load bank statement rows.');
  }

  if (!bankRows.length) {
    throw new Error('No statement rows are available for approval.');
  }

  if (bankRows.some((row: any) => row.status === 'MATCHED')) {
    throw new Error('This statement already contains reconciled rows and cannot be re-approved.');
  }

  const allowedTransactionTypes = new Set(['MONEY_IN', 'MONEY_OUT', 'JOURNAL', 'TRANSFER']);
  const safeTransactionType = allowedTransactionTypes.has(String(transactionType ?? '').toUpperCase()) ? String(transactionType ?? '').toUpperCase() : 'JOURNAL';

  const posted: Array<{ id: string; amount: string; status: string }> = [];
  const failedRowIds: string[] = [];

  for (const row of bankRows) {
    const validated = validateApprovedBankRow(row);
    const amountValue = validated.amount;
    const idempotencyKey = `upload:${businessId}:${statementId}:${row.id}`;
    const lines = buildPostingLinesForAccount(accountQuery.data, cashAccountId, amountValue, row.description ?? 'Approved bank statement posting', validated.direction);

    try {
      const result = await supabase.rpc('post_accounting_transaction_atomic', {
        p_business_id: businessId,
        p_idempotency_key: idempotencyKey,
        p_transaction_type: safeTransactionType,
        p_transaction_date: row.transaction_date,
        p_description: row.description,
        p_reference_no: row.reference || row.id,
        p_amount: amountValue,
        p_financial_account_id: statementQuery.data.financial_account_id,
        p_account_id: accountQuery.data.id,
        p_journal_no: `UPLOAD-${Date.now()}-${String(Math.random()).slice(2, 8)}`,
        p_journal_description: row.description,
        p_lines: lines,
      });

      if (result?.error) {
        throw new Error(result.error.message ?? 'Unable to post the selected statement row.');
      }

      posted.push({ id: row.id, amount: amountValue, status: result?.data?.status ?? 'POSTED' });
    } catch (error) {
      failedRowIds.push(row.id);
      if (posted.length) {
        await supabase.from('audit_logs').insert({
          business_id: businessId,
          user_id: userId,
          action: 'UPLOAD_BATCH_PARTIAL_FAILURE',
          entity_type: 'BANK_STATEMENT',
          entity_id: statementId,
          metadata: {
            posted_count: posted.length,
            failed_row_ids: failedRowIds,
            account_id: accountId,
            attempted_row_count: bankRows.length,
            error: error instanceof Error ? error.message : 'Unknown post error',
          },
        });
      }
      throw new Error(`Batch posting failed after ${posted.length} rows. Retry the statement to continue posting the remaining rows without duplicate ledger entries.`);
    }
  }

  await supabase.from('bank_statements').update({ status: 'UNMATCHED' }).eq('id', statementId).eq('business_id', businessId);
  await supabase.from('bank_transactions').update({ status: 'UNMATCHED' }).eq('bank_statement_id', statementId);
  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'UPLOAD_APPROVED',
    entity_type: 'BANK_STATEMENT',
    entity_id: statementId,
    metadata: { posted_count: posted.length, account_id: accountId, transaction_type: safeTransactionType },
  });

  return {
    posted,
    summary: {
      totalAmount: posted.reduce((sum, row) => sum + Number(row.amount || '0.00'), 0).toFixed(2),
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

  const unmatchedBank = (bankTransactions as any[]).filter((transaction: any) => transaction.status !== 'MATCHED' && transaction.status !== 'PARTIAL').length;
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
  const amountValue = assertValidMoney(matchedAmount, 'Matched amount');

  const { data: bankTransaction, error: bankError } = await supabase
    .from('bank_transactions')
    .select('id, bank_statement_id, amount, status, business_id')
    .eq('id', bankTransactionId)
    .maybeSingle();

  if (bankError) throw new Error(bankError.message ?? 'Unable to load the selected bank transaction.');
  if (!bankTransaction) throw new Error('The selected bank transaction is not valid.');

  const statementCheck = await supabase.from('bank_statements').select('id, business_id').eq('id', bankTransaction.bank_statement_id).maybeSingle();
  if (statementCheck.error) throw new Error(statementCheck.error.message ?? 'Unable to validate statement ownership.');
  if (!statementCheck.data || statementCheck.data.business_id !== businessId) {
    throw new Error('The selected bank transaction does not belong to this business.');
  }

  if (bankTransaction.status === 'MATCHED') {
    throw new Error('This bank transaction is already fully matched.');
  }

  if (amountValue <= 0 || amountValue > Number(bankTransaction.amount || '0.00')) {
    throw new Error('The matched amount must be positive and cannot exceed the bank transaction amount.');
  }

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .select('id, business_id, amount, status')
    .eq('id', transactionId)
    .eq('business_id', businessId)
    .eq('status', 'POSTED')
    .maybeSingle();

  if (transactionError) throw new Error(transactionError.message ?? 'Unable to load the selected book transaction.');
  if (!transaction) throw new Error('The selected book transaction is invalid for this business.');

  const { data: existingMatch } = await supabase
    .from('reconciliation_matches')
    .select('id')
    .eq('business_id', businessId)
    .eq('bank_transaction_id', bankTransactionId)
    .maybeSingle();

  if (existingMatch) {
    throw new Error('This bank transaction already has a reconciliation match.');
  }

  const { data: insertedMatch, error: insertError } = await supabase.from('reconciliation_matches').insert({
    business_id: businessId,
    bank_transaction_id: bankTransactionId,
    transaction_id: transactionId,
    matched_amount: amountValue.toFixed(2),
    match_type: amountValue < Number(bankTransaction.amount || '0.00') ? 'PARTIAL' : 'MANUAL',
    matched_by: userId,
    matched_at: new Date().toISOString(),
  }).select().single();

  if (insertError) {
    throw new Error(insertError.message ?? 'Unable to save the reconciliation match.');
  }

  await supabase.from('bank_transactions').update({
    status: amountValue < Number(bankTransaction.amount || '0.00') ? 'PARTIAL' : 'MATCHED',
  }).eq('id', bankTransactionId).eq('bank_statement_id', bankTransaction.bank_statement_id);

  await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action: 'RECONCILIATION_MATCHED',
    entity_type: 'BANK_TRANSACTION',
    entity_id: bankTransactionId,
    metadata: { transaction_id: transactionId, matched_amount: amountValue.toFixed(2) },
  });

  return { matchId: insertedMatch.id };
}

export async function completeReconciliation(
  supabase: any,
  userId: string,
  businessId: string,
  statementId: string,
): Promise<{ status: string }> {
  await assertBusinessMembership(supabase, userId, businessId);

  const { data: statement, error: statementError } = await supabase
    .from('bank_statements')
    .select('id, business_id, status')
    .eq('id', statementId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (statementError) throw new Error(statementError.message ?? 'Unable to load the selected statement.');
  if (!statement) throw new Error('The selected statement does not belong to this business.');

  const { data: bankTransactions = [], error: bankError } = await supabase
    .from('bank_transactions')
    .select('id, status, amount')
    .eq('bank_statement_id', statementId);

  if (bankError) throw new Error(bankError.message ?? 'Unable to load outstanding bank transactions.');

  if ((bankTransactions as any[]).some((row: any) => row.status !== 'MATCHED')) {
    throw new Error('Reconciliation cannot be finalized while unresolved lines remain.');
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
