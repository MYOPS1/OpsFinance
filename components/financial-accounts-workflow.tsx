'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';

type FinancialAccountsWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

type FinancialAccountRecord = {
  id: string;
  name: string;
  type: string;
  account_code?: string;
  accountCode?: string;
  currency?: string;
  status?: string;
  opening_balance?: string;
  openingBalance?: string;
  account_id?: string | null;
  accountId?: string | null;
};

const formatMoney = (value: string | number | undefined) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 'RM0.00';
  }
  return `RM${numeric.toFixed(2)}`;
};

export function FinancialAccountsWorkflow({ businessId, businessContextError }: FinancialAccountsWorkflowProps) {
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const formRef = useCallback((node: HTMLElement | null) => {
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  const [form, setForm] = useState({
    name: '',
    type: 'BANK',
    accountCode: '',
    currency: 'MYR',
    accountId: '',
    openingBalance: '0.00',
    openingBalanceDate: '2026-09-01',
    status: 'ACTIVE',
  });

  const loadAccounts = useCallback(async () => {
    if (!businessId) {
      setAccounts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/financial-accounts?businessId=${encodeURIComponent(businessId)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load financial accounts.');
      }

      setAccounts(payload.financialAccounts ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load financial accounts.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, [loadAccounts]);

  const resetForm = () => {
    setForm({
      name: '',
      type: 'BANK',
      accountCode: '',
      currency: 'MYR',
      accountId: '',
      openingBalance: '0.00',
      openingBalanceDate: '2026-09-01',
      status: 'ACTIVE',
    });
    setIsEditing(false);
    setSelectedId(null);
    setError(null);
  };

  const handleCreate = async () => {
    if (!businessId) {
      setError('No active business is available for this user.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!form.name.trim()) {
        throw new Error('Account name is required.');
      }
      if (!form.accountCode.trim()) {
        throw new Error('Account code is required.');
      }

      const response = await fetch('/api/financial-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          name: form.name,
          type: form.type,
          accountCode: form.accountCode,
          currency: form.currency,
          accountId: form.accountId || null,
          openingBalance: form.openingBalance,
          openingBalanceDate: form.openingBalanceDate,
          status: form.status,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to create financial account.');
      }

      await loadAccounts();
      resetForm();
      setSelectedId(payload.financialAccount?.id ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to create financial account.');
    } finally {
      setLoading(false);
    }
  };

  if (!businessId) {
    return (
      <main className="opsfinance-workflow-panel" style={{ padding: '1.5rem 1rem 2.5rem' }}>
        <div className="opsfinance-surface" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Financial Accounts</h1>
          <p style={{ margin: 0, color: '#475569' }}>{businessContextError ?? 'No active business is available for this user.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="opsfinance-workflow-panel" style={{ padding: '1.5rem 1rem 2.5rem' }}>
      <div className="opsfinance-workflow-inner" style={{ maxWidth: 1280 }}>
        <header className="opsfinance-workflow-header">
          <div>
            <p className="opsfinance-kicker">OpsFinance</p>
            <h1 style={{ margin: '0.35rem 0 0', fontSize: 'clamp(2rem, 4vw, 2.6rem)' }}>Financial Accounts</h1>
          </div>
          <div className="opsfinance-action-row">
            <Link href="/accounts/chart" className="opsfinance-secondary-button">Accounts</Link>
            <button type="button" className="opsfinance-primary-button" onClick={() => resetForm()}>New account</button>
          </div>
        </header>

        {businessContextError ? <div role="alert" className="opsfinance-surface" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1rem' }}>{businessContextError}</div> : null}

        <section ref={formRef} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Create new account</h2>
            <button type="button" onClick={() => resetForm()} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.6rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Clear</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="E_WALLET">E-Wallet</option><option value="CREDIT_CARD">Credit Card</option><option value="LOAN">Loan</option><option value="OTHER">Other</option></select></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Code<input value={form.accountCode} onChange={(event) => setForm((current) => ({ ...current, accountCode: event.target.value }))} /></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Currency<input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>COA mapping<input value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} /></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Opening balance<input value={form.openingBalance} onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))} /></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Opening date<input type="date" value={form.openingBalanceDate} onChange={(event) => setForm((current) => ({ ...current, openingBalanceDate: event.target.value }))} /></label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
          </div>
          <button type="button" onClick={() => void handleCreate()} style={{ width: 'fit-content', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>+ Create Account</button>
        </section>

        {error ? <div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 18, padding: '1rem' }}>{error}</div> : null}

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
          {loading ? <div>Loading financial accounts…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Name</th><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Type</th><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Code</th><th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Opening balance</th><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Status</th></tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{account.name}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{account.type}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{account.account_code ?? account.accountCode ?? '-'}</td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{formatMoney(account.opening_balance ?? account.openingBalance ?? '0.00')}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{account.status ?? 'ACTIVE'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
