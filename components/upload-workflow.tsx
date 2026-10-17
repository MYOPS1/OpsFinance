'use client';

import React, { useMemo, useState } from 'react';

import { AccountingEngine } from '../packages/accounting';
import { UploadConvertService } from '../packages/upload';

const defaultCsv = `Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-16,Petrol purchase,PO-2041,120.00,,4880.00`;

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

type UploadWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

export function UploadWorkflow({ businessId, businessContextError }: UploadWorkflowProps) {
  const [service, setService] = useState<UploadConvertService | null>(null);
  const [batch, setBatch] = useState<any>(null);
  const [sourceText, setSourceText] = useState(defaultCsv);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const previewSummary = useMemo(() => ({
    matched: batch?.candidates?.filter((candidate: any) => candidate.status === 'APPROVED' || candidate.status === 'POSTED').length ?? 0,
    pending: batch?.candidates?.filter((candidate: any) => candidate.status !== 'APPROVED' && candidate.status !== 'POSTED').length ?? 0,
  }), [batch]);

  const activeSelectedCandidateId = batch && selectedCandidateId && batch.candidates.some((candidate: any) => candidate.id === selectedCandidateId)
    ? selectedCandidateId
    : batch?.candidates[0]?.id ?? null;

  if (!businessId) {
    return (
      <main className="opsfinance-workflow-panel" style={{ padding: '2rem 1rem' }}>
        <div className="opsfinance-surface" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
          <p style={{ marginBottom: 0 }}>{businessContextError ?? 'No active business is available for upload processing.'}</p>
        </div>
      </main>
    );
  }

  const handleApprove = () => {
    if (!service || !activeSelectedCandidateId) {
      setError('Select a candidate before approving it.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const approved = service.approveCandidate(activeSelectedCandidateId, 'ui-user');
      setBatch((current: any) => current ? ({ ...current, candidates: current.candidates.map((candidate: any) => candidate.id === approved.id ? approved : candidate), status: 'APPROVED' }) : current);
      setSuccess(`Approved ${approved.suggestion.description}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The selected candidate could not be approved.');
      setSuccess(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = () => {
    if (!service || !activeSelectedCandidateId) {
      setError('No approved candidate is ready to post.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const posted = service.postApprovedCandidate(activeSelectedCandidateId, 'ui-user', businessId);
      setBatch((current: any) => current ? ({ ...current, candidates: current.candidates.map((candidate: any) => candidate.id === activeSelectedCandidateId ? { ...candidate, status: 'POSTED' } : candidate), status: 'POSTED' }) : current);
      setSuccess(`Posted ${posted.journalId ?? 'journal'} for ${posted.amount ?? 'the selected transaction'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The approved candidate could not be posted.');
      setSuccess(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
          <p style={{ marginBottom: 0 }}>Review imported bank activity before posting.</p>
          <p style={{ marginBottom: 0 }}>Upload workflows are gated to the active business: {businessId}.</p>
        </div>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              File selection
              <input type="file" accept=".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file || !businessId) return;
                const text = await file.text();
                setSourceText(text);
                const validation = new UploadConvertService(buildDemoEngine(businessId)).validateFile({ name: file.name, size: file.size, type: file.type || 'application/octet-stream', content: text });
                if (!validation.isValid) {
                  setError(validation.errors.join(' '));
                  setBatch(null);
                  setSelectedCandidateId(null);
                  return;
                }
                const nextService = new UploadConvertService(buildDemoEngine(businessId));
                const nextBatch = nextService.processBankStatementCsv(text, file.name, businessId, 'ui-user');
                setService(nextService);
                setBatch(nextBatch);
                setSelectedCandidateId(nextBatch.candidates[0]?.id ?? null);
                setError(nextBatch.errors.length ? nextBatch.errors[0].error : null);
              }} />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            CSV preview
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={10}
              style={{ resize: 'vertical', fontFamily: 'monospace' }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" onClick={() => {
              if (!businessId) return;
              const nextService = new UploadConvertService(buildDemoEngine(businessId));
              const nextBatch = nextService.processBankStatementCsv(sourceText, 'demo-bank.csv', businessId, 'ui-user');
              setService(nextService);
              setBatch(nextBatch);
              setSelectedCandidateId(nextBatch.candidates[0]?.id ?? null);
              setError(nextBatch.errors.length ? nextBatch.errors[0].error : null);
              setSuccess(null);
            }} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
              Parse &amp; review
            </button>
            <button type="button" onClick={handleApprove} disabled={isLoading || !activeSelectedCandidateId} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
              Approve selected
            </button>
            <button type="button" onClick={handlePost} disabled={isLoading || !activeSelectedCandidateId} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
              Post approved
            </button>
          </div>
        </section>

        {error ? <div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 18, padding: '1rem' }}>{error}</div> : null}
        {success ? <div role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 18, padding: '1rem' }}>{success}</div> : null}

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <strong>Review preview</strong>
            <span>{previewSummary.pending} pending / {previewSummary.matched} approved</span>
          </div>

          {!batch ? (
            <p style={{ margin: 0 }}>No import has been reviewed yet.</p>
          ) : (
            <>
              {batch.errors.length > 0 ? (
                <ul style={{ marginBottom: '1rem', color: '#475569' }}>
                  {batch.errors.map((entry: any, index: number) => (
                    <li key={`${entry.error}-${index}`}>{entry.error}</li>
                  ))}
                </ul>
              ) : null}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Reference</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.candidates.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '0.75rem' }}>No candidates were generated from the uploaded content.</td></tr>
                    ) : batch.candidates.map((candidate: any) => (
                      <tr key={candidate.id} style={{ background: activeSelectedCandidateId === candidate.id ? '#f8fafc' : 'transparent' }}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                          <button type="button" onClick={() => setSelectedCandidateId(candidate.id)} style={{ background: 'transparent', border: 'none', color: '#0f172a', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                            {candidate.normalized.reference ?? candidate.suggestion.referenceNo ?? '—'}
                          </button>
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{candidate.normalized.description}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>RM{Number(candidate.normalized.amount ?? '0').toFixed(2)}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{candidate.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
