'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { AccountingEngine } from '../packages/accounting';
import { ReconciliationService, type BankTransaction, type BookTransaction, type ReconciliationSummary } from '../packages/reconciliation';

type ReconciliationWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

const DEFAULT_BANK_CSV = `Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-15,Bank charge,CHG-201,10.00,,4990.00
2026-09-16,Petrol purchase,PO-2041,120.00,,4870.00`;
const STORAGE_PREFIX = 'opsfinance-reconciliation-state';

function buildDemoEngine(businessId: string): AccountingEngine {
  return new AccountingEngine({
    businessId,
    accounts: [
      { id: 'coa-sales', businessId, code: '4000', name: 'Sales', accountType: 'REVENUE', normalBalance: 'CREDIT', isSystem: false, isActive: true },
      { id: 'coa-expense', businessId, code: '6000', name: 'Petrol', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      { id: 'coa-cash', businessId, code: '1100', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
    ],
    periods: [{ id: 'period-demo', businessId, name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
    financialAccounts: [{ id: 'fa-bank-demo', businessId, name: 'Demo Bank', type: 'BANK', accountCode: 'DBK', currency: 'MYR', status: 'ACTIVE' }],
  });
}

function parseBankCsv(csvText: string, statementId: string, businessId: string, financialAccountId: string): BankTransaction[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line, index) => {
    const cells = line.split(',');
    const date = cells[0]?.trim() ?? '2026-09-01';
    const description = cells[1]?.trim() ?? `Statement row ${index + 1}`;
    const reference = cells[2]?.trim() ?? `${index + 1}`;
    const debit = cells[3]?.trim() ?? '';
    const credit = cells[4]?.trim() ?? '';
    const amount = debit || credit || '0.00';
    const balance = cells[5]?.trim() ?? amount;

    return {
      id: `bank-${statementId}-${index + 1}`,
      statementId,
      businessId,
      financialAccountId,
      date,
      description,
      normalizedDescription: description.toLowerCase(),
      reference,
      debit,
      credit,
      amount,
      balance,
      direction: debit ? 'DEBIT' : 'CREDIT',
      source: 'csv',
      status: 'IMPORTED',
    };
  });
}

function readStore(storageKey: string): { statementCsv: string; sessionId: string; statementId: string; summary: ReconciliationSummary | null; bankTransactions: BankTransaction[]; bookTransactions: BookTransaction[]; matches: Array<{ id: string; bankTransactionId: string; bookTransactionId: string; status: string; confidence: number }> } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as { statementCsv: string; sessionId: string; statementId: string; summary: ReconciliationSummary | null; bankTransactions: BankTransaction[]; bookTransactions: BookTransaction[]; matches: Array<{ id: string; bankTransactionId: string; bookTransactionId: string; status: string; confidence: number }> };
  } catch {
    return null;
  }
}

function writeStore(storageKey: string, value: { statementCsv: string; sessionId: string; statementId: string; summary: ReconciliationSummary | null; bankTransactions: BankTransaction[]; bookTransactions: BookTransaction[]; matches: Array<{ id: string; bankTransactionId: string; bookTransactionId: string; status: string; confidence: number }> }) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

export function ReconciliationWorkflow({ businessId, businessContextError }: ReconciliationWorkflowProps) {
  const [service, setService] = useState<ReconciliationService | null>(null);
  const [statementCsv, setStatementCsv] = useState(DEFAULT_BANK_CSV);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [statementId, setStatementId] = useState('stmt-demo');
  const [sessionId, setSessionId] = useState('session-demo');
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [bookTransactions, setBookTransactions] = useState<BookTransaction[]>([]);
  const [matches, setMatches] = useState<Array<{ id: string; bankTransactionId: string; bookTransactionId: string; status: string; confidence: number }>>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [status, setStatus] = useState('Ready to import the next bank statement.');
  const [error, setError] = useState<string | null>(null);

  const storageKey = useMemo(() => (businessId ? `${STORAGE_PREFIX}:${businessId}` : null), [businessId]);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    const nextService = new ReconciliationService(buildDemoEngine(businessId));
    const persisted = storageKey ? readStore(storageKey) : null;

    if (persisted) {
      setService(nextService);
      setStatementCsv(persisted.statementCsv);
      setStatementId(persisted.statementId);
      setSessionId(persisted.sessionId);
      setBankTransactions(persisted.bankTransactions);
      setBookTransactions(persisted.bookTransactions);
      setMatches(persisted.matches);
      setSummary(persisted.summary);
      setStatus('Loaded the saved reconciliation state.');
      setError(null);
      return;
    }

    const nextStatementId = 'stmt-demo';
    const nextSessionId = 'session-demo';
    nextService.createStatement({
      id: nextStatementId,
      businessId,
      financialAccountId: 'fa-bank-demo',
      name: 'Demo bank statement',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      openingBalance: '5000.00',
      closingBalance: '4870.00',
    });

    const sampleBankRows = parseBankCsv(DEFAULT_BANK_CSV, nextStatementId, businessId, 'fa-bank-demo');
    const sampleBookRows: BookTransaction[] = [
      { id: 'book-1', businessId, financialAccountId: 'fa-bank-demo', date: '2026-09-12', description: 'Customer payment', referenceNo: 'INV-1001', amount: '500.00', type: 'MONEY_IN', status: 'POSTED', journalId: 'journal-1001' },
      { id: 'book-2', businessId, financialAccountId: 'fa-bank-demo', date: '2026-09-15', description: 'Bank charge', referenceNo: 'CHG-201', amount: '10.00', type: 'MONEY_OUT', status: 'POSTED', journalId: 'journal-1002' },
      { id: 'book-3', businessId, financialAccountId: 'fa-bank-demo', date: '2026-09-16', description: 'Petrol purchase', referenceNo: 'PO-2041', amount: '120.00', type: 'MONEY_OUT', status: 'POSTED', journalId: 'journal-1003' },
    ];

    nextService.addBankTransactions(nextStatementId, sampleBankRows);
    nextService.addBookTransactions(sampleBookRows);
    nextService.createSession({ id: nextSessionId, businessId, financialAccountId: 'fa-bank-demo', statementId: nextStatementId, actor: 'demo-user' });
    nextService.matchTransaction(nextSessionId, sampleBankRows[0].id, sampleBookRows[0].id, 'demo-user');
    nextService.matchTransaction(nextSessionId, sampleBankRows[2].id, sampleBookRows[2].id, 'demo-user');

    const nextSummary = nextService.calculateSummary(nextStatementId);
    const nextMatches = nextService.generateMatches(nextStatementId).map((match) => ({
      id: match.id,
      bankTransactionId: match.bankTransactionId,
      bookTransactionId: match.bookTransactionIds?.[0] ?? '',
      status: match.status,
      confidence: match.confidence,
    }));

    setService(nextService);
    setStatementId(nextStatementId);
    setSessionId(nextSessionId);
    setBankTransactions(sampleBankRows);
    setBookTransactions(sampleBookRows);
    setMatches(nextMatches);
    setSummary(nextSummary);
    setSelectedBankId(sampleBankRows[0]?.id ?? '');
    setSelectedBookId(sampleBookRows[0]?.id ?? '');
    setStatus(`Imported ${sampleBankRows.length} bank rows and ${sampleBookRows.length} posted transactions.`);
    setError(null);
  }, [businessId, storageKey]);

  useEffect(() => {
    if (!businessId || !storageKey || !service) {
      return;
    }

    writeStore(storageKey, {
      statementCsv,
      sessionId,
      statementId,
      summary,
      bankTransactions,
      bookTransactions,
      matches,
    });
  }, [businessId, storageKey, statementCsv, sessionId, statementId, summary, bankTransactions, bookTransactions, matches, service]);

  const unmatchedBank = useMemo(() => (service && statementId ? service.getUnmatchedBankTransactions(statementId) : []), [service, statementId]);
  const unmatchedBook = useMemo(() => {
    if (!service || !sessionId || !businessId) {
      return [];
    }

    return service.getUnmatchedBookTransactions(businessId);
  }, [businessId, service, sessionId]);

  if (!businessId) {
    return (
      <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0, color: '#475569' }}>{businessContextError ?? 'No active business is available for reconciliation.'}</p>
        </div>
      </main>
    );
  }

  const handleImport = () => {
    if (!businessId) {
      return;
    }

    try {
      setError(null);
      const workingService = new ReconciliationService(buildDemoEngine(businessId));
      const nextStatementId = `stmt-${Date.now()}`;
      const nextSessionId = `session-${Date.now()}`;
      workingService.createStatement({
        id: nextStatementId,
        businessId,
        financialAccountId: 'fa-bank-demo',
        name: 'Imported bank statement',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        openingBalance: '5000.00',
        closingBalance: '4870.00',
      });
      const nextBankRows = parseBankCsv(statementCsv, nextStatementId, businessId, 'fa-bank-demo');
      const nextBookRows: BookTransaction[] = nextBankRows.map((bankRow, index) => ({
        id: `book-${nextStatementId}-${index + 1}`,
        businessId,
        financialAccountId: 'fa-bank-demo',
        date: bankRow.date,
        description: bankRow.description,
        referenceNo: bankRow.reference,
        amount: bankRow.amount,
        type: bankRow.direction === 'CREDIT' ? 'MONEY_IN' : 'MONEY_OUT',
        status: 'POSTED',
        journalId: `journal-${nextStatementId}-${index + 1}`,
      }));

      workingService.addBankTransactions(nextStatementId, nextBankRows.map((row) => ({
        ...row,
        statementId: nextStatementId,
        normalizedDescription: row.description.toLowerCase(),
        debit: row.direction === 'DEBIT' ? row.amount : '',
        credit: row.direction === 'CREDIT' ? row.amount : '',
        amount: row.amount,
        balance: row.balance,
        direction: row.direction,
        source: 'csv',
        status: 'IMPORTED',
      })) as BankTransaction[]);
      workingService.addBookTransactions(nextBookRows);
      workingService.createSession({ id: nextSessionId, businessId, financialAccountId: 'fa-bank-demo', statementId: nextStatementId, actor: 'demo-user' });

      nextBankRows.forEach((bankRow, index) => {
        workingService.matchTransaction(nextSessionId, bankRow.id, nextBookRows[index].id, 'demo-user');
      });

      const nextSummary = workingService.calculateSummary(nextStatementId);
      const nextMatches = workingService.generateMatches(nextStatementId).map((match) => ({
        id: match.id,
        bankTransactionId: match.bankTransactionId,
        bookTransactionId: match.bookTransactionIds?.[0] ?? '',
        status: match.status,
        confidence: match.confidence,
      }));

      setService(workingService);
      setStatementId(nextStatementId);
      setSessionId(nextSessionId);
      setBankTransactions(nextBankRows);
      setBookTransactions(nextBookRows);
      setMatches(nextMatches);
      setSummary(nextSummary);
      setSelectedBankId(nextBankRows[0]?.id ?? '');
      setSelectedBookId(nextBookRows[0]?.id ?? '');
      setStatus(`Imported ${nextBankRows.length} statement rows and matched ${nextMatches.length} obvious transactions.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The statement could not be imported.');
    }
  };

  const handleManualMatch = () => {
    if (!businessId || !sessionId || !selectedBankId || !selectedBookId) {
      setError('Select one bank row and one book entry before matching them.');
      return;
    }

    const workingService = service ?? new ReconciliationService(buildDemoEngine(businessId));

    try {
      setError(null);
      const match = workingService.matchTransaction(sessionId, selectedBankId, selectedBookId, 'demo-user');
      const nextMatches = workingService.generateMatches(statementId).map((entry) => ({
        id: entry.id,
        bankTransactionId: entry.bankTransactionId,
        bookTransactionId: entry.bookTransactionIds?.[0] ?? '',
        status: entry.status,
        confidence: entry.confidence,
      }));
      setService(workingService);
      setMatches(nextMatches);
      setSummary(workingService.calculateSummary(statementId));
      setStatus(`Matched ${match.bankTransactionId} to ${match.bookTransactionIds?.[0] ?? ' the selected entry'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The selected bank and book transactions could not be matched.');
    }
  };

  const handleFinalize = () => {
    if (!businessId || !sessionId) {
      return;
    }

    const workingService = service ?? new ReconciliationService(buildDemoEngine(businessId));

    try {
      setError(null);
      const result = workingService.completeReconciliation(sessionId, 'demo-user');
      setService(workingService);
      setSummary(result.summary);
      setStatus(`Reconciliation finalized. Difference: ${result.summary.difference}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The statement still has unresolved exceptions and cannot be finalized.');
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0 }}>Match bank statements to posted ledger entries and complete the reconciliation checklist.</p>
          <p style={{ marginBottom: 0, color: '#475569' }}>Business scope: {businessId}</p>
        </div>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
            Statement import
            <textarea value={statementCsv} onChange={(event) => setStatementCsv(event.target.value)} rows={8} style={{ resize: 'vertical', fontFamily: 'monospace', border: '1px solid #cbd5e1', borderRadius: 12, padding: '0.8rem' }} />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleImport} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Import statement
            </button>
            <button type="button" onClick={handleManualMatch} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Match selected
            </button>
            <button type="button" onClick={handleFinalize} style={{ background: '#dbeafe', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Finalize reconciliation
            </button>
          </div>

          {error ? (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', padding: '0.75rem 1rem' }}>
              {error}
            </div>
          ) : null}

          {summary ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bank total</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.bankTotal}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Book total</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.bookTotal}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Difference</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.difference}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Matched</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.matched}</div>
              </div>
            </div>
          ) : null}

          <div style={{ color: '#334155', fontWeight: 600 }}>{status}</div>
        </section>

        {bankTransactions.length > 0 || bookTransactions.length > 0 ? (
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Bank statement</h2>
                <select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
                  <option value="">Select a bank row</option>
                  {bankTransactions.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.description} — {entry.amount}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <h2 style={{ margin: 0 }}>Book entries</h2>
                <select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
                  <option value="">Select a book row</option>
                  {bookTransactions.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.description} — {entry.amount}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                <h3 style={{ marginTop: 0 }}>Unmatched bank transactions</h3>
                {unmatchedBank.length === 0 ? (
                  <div style={{ color: '#475569' }}>All bank rows are matched or resolved.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.45rem' }}>
                    {unmatchedBank.map((entry) => (
                      <li key={entry.id}>{entry.description} — {entry.amount}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                <h3 style={{ marginTop: 0 }}>Unmatched book entries</h3>
                {unmatchedBook.length === 0 ? (
                  <div style={{ color: '#475569' }}>All ledger rows are reconciled.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.45rem' }}>
                    {unmatchedBook.map((entry) => (
                      <li key={entry.id}>{entry.description} — {entry.amount}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {matches.length > 0 ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                <h3 style={{ marginTop: 0 }}>Current matches</h3>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {matches.map((match) => (
                    <div key={match.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.7rem 0.8rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                      <span>{match.bankTransactionId} ↔ {match.bookTransactionId}</span>
                      <span style={{ fontWeight: 700 }}>{match.status} · {match.confidence}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
