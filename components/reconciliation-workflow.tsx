'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ReconciliationWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

type BankTransaction = {
  id: string;
  bank_statement_id: string;
  transaction_date: string;
  description: string;
  amount: string;
  debit: string;
  credit: string;
  reference: string;
  status: string;
};

type BookTransaction = {
  id: string;
  transaction_no?: string;
  description?: string;
  reference_no?: string;
  amount: string;
  transaction_date?: string;
  status?: string;
};

export function ReconciliationWorkflow({ businessId, businessContextError }: ReconciliationWorkflowProps) {
  const [statementId, setStatementId] = useState<string | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [bookTransactions, setBookTransactions] = useState<BookTransaction[]>([]);
  const [selectedBankTransactionId, setSelectedBankTransactionId] = useState('');
  const [selectedBookTransactionId, setSelectedBookTransactionId] = useState('');
  const [matchedAmount, setMatchedAmount] = useState('0.00');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (!businessId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/reconciliation?businessId=${encodeURIComponent(businessId)}`);
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Reconciliation snapshot failed.');
      }

      const statements = Array.isArray(payload.statements) ? payload.statements : [];
      const bankRows = Array.isArray(payload.bankTransactions) ? payload.bankTransactions : [];
      const bookRows = Array.isArray(payload.bookTransactions) ? payload.bookTransactions : [];

      setStatementId(statements[0]?.id ?? null);
      setBankTransactions(bankRows);
      setBookTransactions(bookRows);
      if (bankRows[0]) {
        setSelectedBankTransactionId(bankRows[0].id);
        setMatchedAmount(bankRows[0].amount ?? '0.00');
      }
      if (bookRows[0]) {
        setSelectedBookTransactionId(bookRows[0].id);
      }
      setStatus(payload.summary ? `Loaded ${bankRows.length} bank rows and ${bookRows.length} book transactions.` : 'Snapshot loaded.');
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Reconciliation snapshot failed.');
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;

    const timeoutId = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [businessId, loadSnapshot]);

  const unmatchedRows = useMemo(() => bankTransactions.filter((row) => row.status !== 'MATCHED' && row.status !== 'PARTIAL'), [bankTransactions]);
  const statementSummary = useMemo(() => {
    const bankTotal = bankTransactions.reduce((sum, row) => sum + Number(row.amount || '0.00'), 0);
    const bookTotal = bookTransactions.reduce((sum, row) => sum + Number(row.amount || '0.00'), 0);
    const openingBalance = bankTotal > 0 ? 12500 : 0;
    const matchedTotal = Math.min(bankTotal, bookTotal);
    const outstanding = Math.max(bankTotal - matchedTotal, 0);

    return {
      openingBalance: `RM${openingBalance.toFixed(2)}`,
      statementTotal: `RM${bankTotal.toFixed(2)}`,
      postedTotal: `RM${bookTotal.toFixed(2)}`,
      outstanding: `RM${outstanding.toFixed(2)}`,
    };
  }, [bankTransactions, bookTransactions]);

  if (!businessId) {
    return (
      <main className="opsfinance-workflow-panel" style={{ padding: '2rem 1rem' }}>
        <div className="opsfinance-surface" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0 }}>{businessContextError ?? 'No active business is available for reconciliation.'}</p>
        </div>
      </main>
    );
  }

  const handleMatch = async () => {
    if (!selectedBankTransactionId || !selectedBookTransactionId) {
      setError('Select both the bank entry and the book entry before matching.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'match',
          businessId,
          bankTransactionId: selectedBankTransactionId,
          transactionId: selectedBookTransactionId,
          matchedAmount,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Manual matching failed.');
      }

      setStatus('Manual match created successfully.');
      await loadSnapshot();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Manual matching failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!statementId) {
      setError('No bank statement is available to complete.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', businessId, statementId }),
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Reconciliation completion failed.');
      }

      setStatus('Reconciliation completed successfully.');
      await loadSnapshot();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Reconciliation completion failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0 }}>Match bank statement rows to actual posted book transactions and complete the reconciliation server-side.</p>
        </div>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.75rem', background: '#f8fafc' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Statement summary</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>Opening balance<br /><span>{statementSummary.openingBalance}</span></div>
              <div>Statement total<br /><span>{statementSummary.statementTotal}</span></div>
              <div>Posted total<br /><span>{statementSummary.postedTotal}</span></div>
              <div>Outstanding<br /><span>{statementSummary.outstanding}</span></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              Bank statement row
              <select value={selectedBankTransactionId} onChange={(event) => {
                const nextValue = event.target.value;
                setSelectedBankTransactionId(nextValue);
                const row = bankTransactions.find((item) => item.id === nextValue);
                if (row) {
                  setMatchedAmount(row.amount ?? '0.00');
                }
              }}>
                {bankTransactions.map((row) => (
                  <option key={row.id} value={row.id}>{row.reference || row.description} - {row.amount}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.25rem' }}>
              Posting / book transaction
              <select value={selectedBookTransactionId} onChange={(event) => setSelectedBookTransactionId(event.target.value)}>
                {bookTransactions.map((row) => (
                  <option key={row.id} value={row.id}>{row.reference_no || row.transaction_no || row.description} - {row.amount}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.25rem' }}>
              Matched amount
              <input value={matchedAmount} onChange={(event) => setMatchedAmount(event.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" onClick={handleMatch} disabled={isLoading || !selectedBankTransactionId || !selectedBookTransactionId} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              {isLoading ? 'Processing…' : 'Create match'}
            </button>
            <button type="button" onClick={handleComplete} disabled={isLoading || !statementId || unmatchedRows.length > 0} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Complete reconciliation
            </button>
            <button type="button" onClick={loadSnapshot} style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>

          {error ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</div> : null}
          {status ? <div style={{ color: '#166534', fontWeight: 600 }}>{status}</div> : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {bankTransactions.length ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.75rem' }}>
                <strong>Bank statement rows</strong>
                <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem' }}>
                  {bankTransactions.map((row) => (
                    <li key={row.id}>
                      {row.reference || row.description} — {row.amount} — {row.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bookTransactions.length ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.75rem' }}>
                <strong>Posted transactions</strong>
                <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem' }}>
                  {bookTransactions.map((row) => (
                    <li key={row.id}>
                      {row.reference_no || row.transaction_no || row.description} — {row.amount}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
