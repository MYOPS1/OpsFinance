'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { AccountingEngine, type FinancialAccount } from '../packages/accounting';
import { ReconciliationService, type BankTransaction, type BookTransaction, type ReconciliationSummary } from '../packages/reconciliation';

type ReconciliationWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

const demoStatementCsv = `Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-15,Bank charge,CHG-201,10.00,,4990.00`;

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

export function ReconciliationWorkflow({ businessId, businessContextError }: ReconciliationWorkflowProps) {
  const [service, setService] = useState<ReconciliationService | null>(null);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [matches, setMatches] = useState<Array<any>>([]);
  const [statementId, setStatementId] = useState('stmt-demo');
  const [sessionId, setSessionId] = useState('session-demo');
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [bookTransactions, setBookTransactions] = useState<BookTransaction[]>([]);
  const [sourceText, setSourceText] = useState(demoStatementCsv);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const initializeDemo = (nextBusinessId: string) => {
    const nextService = new ReconciliationService(buildDemoEngine(nextBusinessId));
    const nextStatementId = 'stmt-demo';
    const nextSessionId = 'session-demo';

    nextService.createStatement({
      id: nextStatementId,
      businessId: nextBusinessId,
      financialAccountId: 'fa-bank-demo',
      name: 'Demo bank statement',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      openingBalance: '5000.00',
      closingBalance: '4990.00',
    });

    const session = nextService.createSession({
      id: nextSessionId,
      businessId: nextBusinessId,
      financialAccountId: 'fa-bank-demo',
      statementId: nextStatementId,
      actor: 'ui-user',
    });

    const bankRows = parseBankCsv(demoStatementCsv, nextStatementId, nextBusinessId, 'fa-bank-demo');
    nextService.addBankTransactions(nextStatementId, bankRows);

    const books: BookTransaction[] = [
      {
        id: 'book-1',
        businessId: nextBusinessId,
        financialAccountId: 'fa-bank-demo',
        date: '2026-09-12',
        description: 'Customer payment',
        referenceNo: 'INV-1001',
        amount: '500.00',
        type: 'MONEY_IN',
        status: 'POSTED',
        journalId: 'journal-1001',
      },
      {
        id: 'book-2',
        businessId: nextBusinessId,
        financialAccountId: 'fa-bank-demo',
        date: '2026-09-15',
        description: 'Bank charge',
        referenceNo: 'CHG-201',
        amount: '10.00',
        type: 'MONEY_OUT',
        status: 'POSTED',
        journalId: 'journal-1002',
      },
    ];

    nextService.addBookTransactions(books);
    nextService.matchTransaction(session.id, bankRows[0].id, books[0].id, 'ui-user');

    const nextSummary = nextService.calculateSummary(nextStatementId);
    const nextMatches = nextService.generateMatches(nextStatementId);

    setService(nextService);
    setSummary(nextSummary);
    setMatches(nextMatches);
    setBankTransactions(nextService.getBankTransactions(nextStatementId));
    setBookTransactions(nextService.getBookTransactions(nextBusinessId));
    setStatementId(nextStatementId);
    setSessionId(nextSessionId);
    setStatus(`Loaded ${bankRows.length} statement rows and ${books.length} book transactions.`);
    setError(null);
  };

  useEffect(() => {
    if (!businessId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initializeDemo(businessId);
  }, [businessId]);

  const unresolved = useMemo(() => {
    if (!service) return [];
    return service.getUnmatchedBankTransactions(statementId);
  }, [service, statementId]);

  if (!businessId) {
    return (
      <main className="opsfinance-workflow-panel" style={{ padding: '2rem 1rem' }}>
        <div className="opsfinance-surface" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0, color: '#475569' }}>{businessContextError ?? 'No active business is available for reconciliation.'}</p>
        </div>
      </main>
    );
  }

  const handleFinalize = () => {
    if (!service) return;
    try {
      const result = service.completeReconciliation(sessionId, 'ui-user');
      setSummary(result.summary);
      setStatus(`Reconciliation completed. Difference: ${result.summary.difference}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The reconciliation cannot be finalized while exceptions remain.');
    }
  };

  const handleRefresh = () => {
    initializeDemo(businessId);
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Bank Reconciliation</h1>
          <p style={{ marginBottom: 0 }}>Reconciliation workflows are scoped to the active business: {businessId}.</p>
        </div>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            Statement input
            <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={8} style={{ resize: 'vertical', fontFamily: 'monospace' }} />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" onClick={handleRefresh} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Refresh demo</button>
            <button type="button" onClick={() => {
              if (!businessId || !service) return;
              const rows = parseBankCsv(sourceText, statementId, businessId, 'fa-bank-demo');
              service.createStatement({
                id: statementId,
                businessId,
                financialAccountId: 'fa-bank-demo',
                name: 'Updated statement',
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                openingBalance: '5000.00',
                closingBalance: '4990.00',
              });
              service.addBankTransactions(statementId, rows);
              setBankTransactions(service.getBankTransactions(statementId));
              setSummary(service.calculateSummary(statementId));
              setMatches(service.generateMatches(statementId));
              setStatus('Statement refreshed from the latest input.');
            }} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Load current statement</button>
            <button type="button" onClick={handleFinalize} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>Finalize reconciliation</button>
          </div>
        </section>

        {status ? <div role="status" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 18, padding: '1rem' }}>{status}</div> : null}
        {error ? <div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 18, padding: '1rem' }}>{error}</div> : null}

        {summary ? (
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Statement summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div><strong>Bank total</strong><div>RM{Number(summary.bankTotal ?? '0').toFixed(2)}</div></div>
              <div><strong>Book total</strong><div>RM{Number(summary.bookTotal ?? '0').toFixed(2)}</div></div>
              <div><strong>Difference</strong><div>RM{Number(summary.difference ?? '0').toFixed(2)}</div></div>
              <div><strong>Matched</strong><div>{summary.matched}</div></div>
              <div><strong>Unmatched</strong><div>{summary.unmatchedBank}</div></div>
              <div><strong>Status</strong><div>{summary.status}</div></div>
            </div>
          </section>
        ) : null}

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Matched / unresolved</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Bank ref</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bankTransactions.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '0.75rem' }}>No bank rows have been imported yet.</td></tr>
                ) : bankTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.reference}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.description}</td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>RM{Number(transaction.amount ?? '0').toFixed(2)}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{transaction.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Matches</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '0.4rem' }}>
            {matches.length === 0 ? <li>No matches generated yet.</li> : matches.map((match) => (
              <li key={match.id}>{match.status} — {match.reasons?.[0] ?? 'No match reason provided'} (confidence {match.confidence})</li>
            ))}
          </ul>
        </section>

        {unresolved.length > 0 ? (
          <section style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 18, padding: '1rem' }}>
            <strong>Unresolved items</strong>
            <ul style={{ marginBottom: 0 }}>
              {unresolved.map((transaction) => <li key={transaction.id}>{transaction.reference}: {transaction.description}</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
