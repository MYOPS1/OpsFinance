'use client';

import React, { useCallback, useEffect, useState } from 'react';

type ChartOfAccountsWorkflowProps = { businessId?: string };

export function ChartOfAccountsWorkflow({ businessId }: ChartOfAccountsWorkflowProps) {
  const [accounts, setAccounts] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    parent_id: '',
    is_active: true,
  });

  const loadAccounts = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/accounts?businessId=${encodeURIComponent(businessId)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load chart of accounts.');
      }

      setAccounts(payload.accounts ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load chart of accounts.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts();
  }, [loadAccounts]);

  const handleCreate = async () => {
    if (!businessId) return;

    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          code: form.code,
          name: form.name,
          account_type: form.account_type,
          normal_balance: form.normal_balance,
          parent_id: form.parent_id || null,
          is_active: form.is_active,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not create account.');
      }

      setForm({ code: '', name: '', account_type: 'ASSET', normal_balance: 'DEBIT', parent_id: '', is_active: true });
      await loadAccounts();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create account.');
    }
  };

  if (!businessId) {
    return <main className="opsfinance-workflow-panel" style={{ padding: '2rem' }}><div className="opsfinance-surface" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>No active business available for chart of accounts.</div></main>;
  }

  return (
    <main className="opsfinance-workflow-panel" style={{ padding: '1.5rem 1rem 2rem' }}>
      <div className="opsfinance-workflow-inner" style={{ maxWidth: 1200 }}>
        <div className="opsfinance-workflow-header"><p className="opsfinance-kicker">OpsFinance</p><h1>Chart of Accounts</h1></div>

        <section className="opsfinance-surface" style={{ padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div className="opsfinance-form-grid">
            <label>Code<input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label>
            <label>Name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Type<select value={form.account_type} onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value }))}><option value="ASSET">ASSET</option><option value="LIABILITY">LIABILITY</option><option value="EQUITY">EQUITY</option><option value="REVENUE">REVENUE</option><option value="COGS">COGS</option><option value="EXPENSE">EXPENSE</option></select></label>
            <label>Normal Balance<select value={form.normal_balance} onChange={(event) => setForm((current) => ({ ...current, normal_balance: event.target.value }))}><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></select></label>
          </div>
          <div className="opsfinance-action-row">
            <button type="button" className="opsfinance-primary-button" onClick={handleCreate}>Create account</button>
            <label className="opsfinance-inline-label"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} /> Active</label>
          </div>
        </section>

        {error ? <div role="alert" className="opsfinance-surface" style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1rem' }}>{error}</div> : null}

        <section className="opsfinance-surface" style={{ padding: '1rem' }}>
          {loading ? <div>Loading chart data…</div> : (
            <table className="opsfinance-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Normal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.code}</td>
                    <td>{account.name}</td>
                    <td>{account.account_type}</td>
                    <td>{account.normal_balance}</td>
                    <td>{account.is_active ? 'ACTIVE' : 'INACTIVE'}</td>
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
