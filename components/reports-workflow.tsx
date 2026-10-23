'use client';

import React, { useEffect, useState } from 'react';

import { isPreviewAuthBypassEnabled } from '../lib/auth/navigation';
import { PREVIEW_BUSINESS_ID, getPreviewFinancialSnapshot, getPreviewReportRepository } from '../lib/preview-data';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { AccountingEngine, type BusinessAccount } from '../packages/accounting';
import { FinancialReportService } from '../packages/reports';

type ReportsWorkflowProps = { businessId?: string; businessContextError?: string | null; defaultReport?: 'ledger' | 'statement' | 'trial' | 'pnl' | 'sheet' | 'cash' };

const formatMoney = (value: string | number | undefined) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 'RM0.00';
  }
  return `RM${numeric.toFixed(2)}`;
};

export function ReportsWorkflow({ businessId, businessContextError, defaultReport = 'trial' }: ReportsWorkflowProps) {
  const [report, setReport] = useState<'ledger' | 'statement' | 'trial' | 'pnl' | 'sheet' | 'cash'>(defaultReport);
  const [dateFrom, setDateFrom] = useState('2026-10-01');
  const [dateTo, setDateTo] = useState('2026-10-31');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [trial, setTrial] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [sheet, setSheet] = useState<any>(null);
  const [cash, setCash] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!businessId) {
        setAccounts([]);
        setTrial(null);
        setPnl(null);
        setSheet(null);
        setCash(null);
        setLedger(null);
        setStatement(null);
        return;
      }

      const isPreviewBusiness = isPreviewAuthBypassEnabled() || businessId === PREVIEW_BUSINESS_ID;

      if (isPreviewBusiness) {
        const snapshot = getPreviewFinancialSnapshot();
        const accountsList = snapshot.accounts as BusinessAccount[];
        const repository = getPreviewReportRepository();
        const service = new FinancialReportService({
          engine: new AccountingEngine({ businessId, accounts: accountsList }),
          repository,
        });

        setAccounts(accountsList);
        setSelectedAccountId((accountsList[0]?.id ?? ''));
        setTrial(service.getTrialBalance({ businessId, dateFrom, dateTo }));
        setPnl(service.getProfitAndLoss({ businessId, dateFrom, dateTo }));
        setSheet(service.getBalanceSheet({ businessId, dateFrom, dateTo }));
        setCash(service.getCashFlow({ businessId, dateFrom, dateTo }));
        setLedger(service.getGeneralLedger({ businessId, dateFrom, dateTo }));
        if (accountsList[0]) {
          setStatement(service.getAccountStatement({ businessId, accountId: accountsList[0].id, dateFrom, dateTo }));
        }
        setError(null);
        setLoading(false);
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        setError('Supabase is not configured in this environment.');
        return;
      }

      setLoading(true);
      try {
        const { data: accountRows, error: accountError } = await client.from('accounts').select('*').eq('business_id', businessId).order('code', { ascending: true });
        if (accountError) throw new Error(accountError.message);

        const { data: journalRows, error: journalError } = await client
          .from('journal_entries')
          .select('id, journal_no, journal_date, description, status, journal_lines(*)')
          .eq('business_id', businessId)
          .eq('status', 'POSTED');
        if (journalError) throw new Error(journalError.message);

        const mappedAccounts = (accountRows ?? []).map((row: any) => ({
          id: row.id,
          businessId: row.business_id,
          code: row.code,
          name: row.name,
          accountType: row.account_type,
          normalBalance: row.normal_balance,
          isSystem: row.is_system,
          isActive: row.is_active,
          parentId: row.parent_id,
        })) as BusinessAccount[];

        const repository = {
          getBusinessAccounts: () => mappedAccounts,
          getPostedJournals: () =>
            (journalRows ?? []).map((row: any) => ({
              id: row.id,
              businessId: row.business_id,
              journalNo: row.journal_no,
              journalDate: row.journal_date,
              sourceType: row.source_type ?? 'MANUAL',
              description: row.description,
              status: row.status,
              referenceNo: row.journal_no,
              lines: (row.journal_lines ?? []).map((line: any) => ({
                id: line.id,
                journalEntryId: line.journal_entry_id,
                accountId: line.account_id,
                debit: String(line.debit ?? '0.00'),
                credit: String(line.credit ?? '0.00'),
                description: line.description,
                financialAccountId: line.financial_account_id,
                contactId: line.contact_id,
              })),
              createdAt: row.created_at ?? new Date().toISOString(),
            })),
        };

        const service = new FinancialReportService({
          engine: new AccountingEngine({ businessId, accounts: mappedAccounts }),
          repository,
        });

        setAccounts(mappedAccounts);
        setSelectedAccountId((mappedAccounts[0]?.id ?? ''));
        setTrial(service.getTrialBalance({ businessId, dateFrom, dateTo }));
        setPnl(service.getProfitAndLoss({ businessId, dateFrom, dateTo }));
        setSheet(service.getBalanceSheet({ businessId, dateFrom, dateTo }));
        setCash(service.getCashFlow({ businessId, dateFrom, dateTo }));
        setLedger(service.getGeneralLedger({ businessId, dateFrom, dateTo }));
        if (mappedAccounts[0]) {
          setStatement(service.getAccountStatement({ businessId, accountId: mappedAccounts[0].id, dateFrom, dateTo }));
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Reports could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [businessId, dateFrom, dateTo]);

  useEffect(() => {
    if (!businessId || !selectedAccountId) return;

    const isPreviewBusiness = isPreviewAuthBypassEnabled() || businessId === PREVIEW_BUSINESS_ID;
    if (isPreviewBusiness) {
      const snapshot = getPreviewFinancialSnapshot();
      const service = new FinancialReportService({
        engine: new AccountingEngine({ businessId, accounts: snapshot.accounts as BusinessAccount[] }),
        repository: getPreviewReportRepository(),
      });
      setStatement(service.getAccountStatement({ businessId, accountId: selectedAccountId, dateFrom, dateTo }));
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) return;

    const instance = new AccountingEngine({ businessId, accounts });
    const service = new FinancialReportService({
      engine: instance,
      repository: {
        getBusinessAccounts: () => accounts,
        getPostedJournals: () => [],
      },
    });

    if (accounts.length > 0) {
      const statementReport = service.getAccountStatement({ businessId, accountId: selectedAccountId, dateFrom, dateTo });
      setStatement(statementReport);
    }
  }, [selectedAccountId, businessId, dateFrom, dateTo, accounts]);

  const rowData = report === 'ledger' ? ledger : report === 'trial' ? trial : report === 'pnl' ? pnl : report === 'sheet' ? sheet : report === 'cash' ? cash : statement;

  const buttonLabels: Record<string, string> = {
    ledger: 'General Ledger',
    statement: 'Account Statement',
    trial: 'Trial Balance',
    pnl: 'Profit & Loss',
    sheet: 'Balance Sheet',
    cash: 'Cash Flow',
  };

  if (!businessId) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100vh' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem', display: 'grid', gap: '1rem' }}>
          <h1 style={{ margin: 0 }}>Financial Reports</h1>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {Object.entries(buttonLabels).map(([key, label]) => (
              <button key={key} type="button" style={{ border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', color: '#0f172a', padding: '0.65rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>Start date</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>End date</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>Account</span>
              <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                <option value="">None selected</option>
              </select>
            </label>
          </div>
          <p style={{ margin: 0, color: '#475569' }}>{businessContextError ?? 'No active business for reports.'}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return <main style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}><div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 18, padding: '1.5rem' }}>{error}</div></main>;
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '1.5rem 1rem 2rem', fontFamily: 'Arial, sans-serif', color: '#0f172a' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <p style={{ margin: 0, color: '#475569', letterSpacing: '0.08em', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>OpsFinance</p>
            <h1 style={{ margin: '0.35rem 0 0' }}>Financial Reports</h1>
          </div>
        </header>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['ledger', 'statement', 'trial', 'pnl', 'sheet', 'cash'].map((key) => (
              <button key={key} type="button" onClick={() => setReport(key as any)} style={{ border: 'none', background: report === key ? '#0f172a' : '#e2e8f0', color: report === key ? '#fff' : '#0f172a', borderRadius: 10, padding: '0.7rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                {buttonLabels[key]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>Start date</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>End date</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span>Account</span>
              <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {loading ? <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.25rem' }}>Loading real reporting data…</div> : null}

        {!loading && rowData ? (
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
            {report === 'trial' ? (
              <div>
                <h2>Trial Balance</h2>
                <p>Total Debit: {formatMoney(trial?.totalDebit ?? '0.00')} / Total Credit: {formatMoney(trial?.totalCredit ?? '0.00')}</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Account</th><th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Debit</th><th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Credit</th></tr>
                  </thead>
                  <tbody>
                    {(trial?.rows ?? []).map((row: any) => (
                      <tr key={row.accountId}><td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{row.accountName}</td><td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{formatMoney(row.debit)}</td><td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{formatMoney(row.credit)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {report === 'pnl' ? (
              <div>
                <h2>P&L</h2>
                <p>Revenue: {formatMoney(pnl?.revenueTotal ?? '0.00')} / Expenses: {formatMoney(pnl?.expensesTotal ?? '0.00')} / Net Profit: {formatMoney(pnl?.netProfit ?? '0.00')}</p>
              </div>
            ) : null}

            {report === 'sheet' ? (
              <div>
                <h2>Balance Sheet</h2>
                <p>Total Assets: {formatMoney(sheet?.totalAssets ?? '0.00')} / Total Liabilities: {formatMoney(sheet?.totalLiabilities ?? '0.00')} / Total Equity: {formatMoney(sheet?.totalEquity ?? '0.00')}</p>
              </div>
            ) : null}

            {report === 'cash' ? (
              <div>
                <h2>Cash Flow</h2>
                <p>Closing Cash: {formatMoney(cash?.closingCash ?? '0.00')} / Net Cash Flow: {formatMoney(cash?.netCashFlow ?? '0.00')}</p>
              </div>
            ) : null}

            {report === 'ledger' ? (
              <div>
                <h2>General Ledger</h2>
                <p>Closing Balance: {formatMoney(ledger?.closingBalance ?? '0.00')}</p>
              </div>
            ) : null}

            {report === 'statement' ? (
              <div>
                <h2>Account Statement</h2>
                <p>Closing Balance: {formatMoney(statement?.closingBalance ?? '0.00')}</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
