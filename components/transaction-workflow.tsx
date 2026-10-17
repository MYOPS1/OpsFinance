'use client';

import React, { useCallback, useEffect, useState } from 'react';

type TransactionWorkflowProps = { businessId?: string; defaultType?: 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'JOURNAL' };

const formatMoney = (value: string | number | undefined) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 'RM0.00';
  }
  return `RM${numeric.toFixed(2)}`;
};

type TransactionFormState = {
  type: 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'JOURNAL';
  date: string;
  description: string;
  amount: string;
  reference_no: string;
  financial_account_id: string;
  account_id: string;
};

export function TransactionWorkflow({ businessId, defaultType = 'MONEY_IN' }: TransactionWorkflowProps) {
  const [transactions, setTransactions] = useState<Array<any>>([]);
  const [accounts, setAccounts] = useState<Array<any>>([]);
  const [financialAccounts, setFinancialAccounts] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TransactionFormState>({
    type: defaultType,
    date: '2026-10-05',
    description: 'Real DB posting',
    amount: '100.00',
    reference_no: 'UI-POST-001',
    financial_account_id: '',
    account_id: '',
  });

  const loadData = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/transactions?businessId=${encodeURIComponent(businessId)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load transaction data.');
      }

      setAccounts(payload.accounts ?? []);
      setFinancialAccounts(payload.financialAccounts ?? []);
      setTransactions(payload.transactions ?? []);
      setForm((current) => ({
        ...current,
        financial_account_id: payload.financialAccounts?.[0]?.id ?? '',
        account_id: payload.accounts?.[0]?.id ?? '',
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load transaction data.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!businessId || !form.financial_account_id || !form.account_id) {
      setError('Select a financial account and general ledger account before posting.');
      return;
    }

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          type: form.type,
          date: form.date,
          description: form.description,
          amount: form.amount,
          reference_no: form.reference_no,
          financial_account_id: form.financial_account_id,
          account_id: form.account_id,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Transaction could not be created.');
      }

      setError(null);
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Transaction could not be created.');
    }
  };

  if (!businessId) {
    return <main className="opsfinance-workflow-panel" style={{ padding: '2rem' }}><div className="opsfinance-surface" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>No active business available for transaction posting.</div></main>;
  }

  return (
    <main className="opsfinance-workflow-panel" style={{ padding: '1.5rem 1rem 2rem' }}>
      <div className="opsfinance-workflow-inner" style={{ maxWidth: 1200 }}>
        <div className="opsfinance-workflow-header"><p className="opsfinance-kicker">OpsFinance</p><h1>Transactions</h1></div>
        <div className="opsfinance-surface" style={{ padding: '0.75rem 1rem' }}>
          <strong>All Transactions</strong>
        </div>

        <section className="opsfinance-surface" style={{ padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[
              { value: 'MONEY_IN', label: 'Money In' },
              { value: 'MONEY_OUT', label: 'Money Out' },
              { value: 'TRANSFER', label: 'Transfer' },
              { value: 'JOURNAL', label: 'Journal Entry' },
            ].map((option) => {
              const isActive = form.type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, type: option.value as TransactionFormState['type'] }))}
                  style={{
                    background: isActive ? '#0f172a' : '#f8fafc',
                    color: isActive ? '#fff' : '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '0.6rem 0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="opsfinance-form-grid">
            <label>Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as TransactionFormState['type'] }))}><option value="MONEY_IN">Money In</option><option value="MONEY_OUT">Money Out</option><option value="TRANSFER">Transfer</option><option value="JOURNAL">Journal</option></select></label>
            <label>Date<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
            <label>Amount<input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label>
          </div>
          <div className="opsfinance-form-grid">
            <label>Financial account<select value={form.financial_account_id} onChange={(event) => setForm((current) => ({ ...current, financial_account_id: event.target.value }))}>{financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Ledger account<select value={form.account_id} onChange={(event) => setForm((current) => ({ ...current, account_id: event.target.value }))}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          </div>
          <div className="opsfinance-form-grid">
            <label>Description<input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Reference<input value={form.reference_no} onChange={(event) => setForm((current) => ({ ...current, reference_no: event.target.value }))} /></label>
          </div>
          <button type="button" className="opsfinance-primary-button" onClick={handleCreate}>Create posting</button>
        </section>

        {error ? <div role="alert" className="opsfinance-surface" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1rem' }}>{error}</div> : null}

        <section className="opsfinance-surface" style={{ padding: '1rem' }}>
          {loading ? <div>Loading transactions…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Reference</th><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Type</th><th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Amount</th><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Date</th></tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}><td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.reference_no ?? transaction.transaction_no}</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.transaction_type}</td><td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{formatMoney(transaction.amount)}</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.transaction_date}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
