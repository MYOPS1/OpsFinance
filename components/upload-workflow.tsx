'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { AccountingEngine } from '../packages/accounting';
import { UploadConvertService, type ImportBatch, type UploadCandidate } from '../packages/upload';

const DEFAULT_CSV = `Date,Description,Reference,Debit,Credit,Balance
2026-09-12,Customer payment,INV-1001,,500.00,5000.00
2026-09-15,Petrol purchase,PO-2041,120.00,,4880.00`;
const STORAGE_PREFIX = 'opsfinance-upload-state';

type UploadWorkflowProps = {
  businessId?: string;
  businessContextError?: string | null;
};

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

function readStore(storageKey: string): { batch: ImportBatch | null; sourceText: string; fileName: string; selectedCandidateId: string | null } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as { batch: ImportBatch | null; sourceText: string; fileName: string; selectedCandidateId: string | null };
  } catch {
    return null;
  }
}

function writeStore(storageKey: string, value: { batch: ImportBatch | null; sourceText: string; fileName: string; selectedCandidateId: string | null }) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function createBatchFromText(service: UploadConvertService, businessId: string, fileName: string, text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error('Paste a CSV row or invoice/receipt text before reviewing the file.');
  }

  if (/^Date\s*,.*(Debit|Credit|Balance)/i.test(trimmed) || /^date\s*,.*(debit|credit|balance)/i.test(trimmed)) {
    return service.processBankStatementCsv(trimmed, fileName, businessId, 'demo-user');
  }

  const lower = trimmed.toLowerCase();
  if (/(invoice|bill)/i.test(fileName) || /invoice|bill|total:|amount due/i.test(lower)) {
    const candidate = service.extractInvoice({
      businessId,
      sourceType: 'INVOICE',
      rawText: trimmed,
      uploadedBy: 'demo-user',
    });

    return {
      id: `batch-${Date.now()}`,
      businessId,
      fileName,
      source: 'INVOICE',
      uploadedBy: 'demo-user',
      uploadedAt: new Date().toISOString(),
      status: 'REVIEW',
      candidates: [candidate],
      errors: [],
    } as ImportBatch;
  }

  if (/(receipt|voucher)/i.test(fileName) || /receipt|merchant|total:/i.test(lower)) {
    const candidate = service.extractReceipt({
      businessId,
      sourceType: 'RECEIPT',
      rawText: trimmed,
      uploadedBy: 'demo-user',
    });

    return {
      id: `batch-${Date.now()}`,
      businessId,
      fileName,
      source: 'RECEIPT',
      uploadedBy: 'demo-user',
      uploadedAt: new Date().toISOString(),
      status: 'REVIEW',
      candidates: [candidate],
      errors: [],
    } as ImportBatch;
  }

  throw new Error('Only CSV bank statements, invoices and receipts are supported in this workflow.');
}

export function UploadWorkflow({ businessId, businessContextError }: UploadWorkflowProps) {
  const [service, setService] = useState<UploadConvertService | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [sourceText, setSourceText] = useState(DEFAULT_CSV);
  const [fileName, setFileName] = useState('bank-upload.csv');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready to review uploaded bank activity.');
  const [isBusy, setIsBusy] = useState(false);

  const storageKey = useMemo(() => (businessId ? `${STORAGE_PREFIX}:${businessId}` : null), [businessId]);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    const nextService = new UploadConvertService(buildDemoEngine(businessId));
    const persisted = storageKey ? readStore(storageKey) : null;

    if (persisted?.batch) {
      setService(nextService);
      setBatch(persisted.batch);
      setSourceText(persisted.sourceText ?? DEFAULT_CSV);
      setFileName(persisted.fileName ?? 'bank-upload.csv');
      setSelectedCandidateId(persisted.selectedCandidateId ?? persisted.batch.candidates[0]?.id ?? null);
      setStatus('Loaded the saved upload review from this business.');
      setError(null);
      return;
    }

    const nextBatch = nextService.processBankStatementCsv(DEFAULT_CSV, 'bank-upload.csv', businessId, 'demo-user');
    setService(nextService);
    setBatch(nextBatch);
    setSelectedCandidateId(nextBatch.candidates[0]?.id ?? null);
    setStatus(`Loaded ${nextBatch.candidates.length} imported rows for review.`);
    setError(null);
  }, [businessId, storageKey]);

  useEffect(() => {
    if (!businessId || !storageKey) {
      return;
    }

    writeStore(storageKey, {
      batch,
      sourceText,
      fileName,
      selectedCandidateId,
    });
  }, [businessId, storageKey, batch, sourceText, fileName, selectedCandidateId]);

  const selectedCandidate = useMemo<UploadCandidate | null>(() => {
    if (!batch) {
      return null;
    }

    return batch.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? batch.candidates[0] ?? null;
  }, [batch, selectedCandidateId]);

  const previewSummary = useMemo(() => ({
    matched: batch?.candidates.filter((candidate) => candidate.status === 'APPROVED' || candidate.status === 'POSTED').length ?? 0,
    pending: batch?.candidates.filter((candidate) => candidate.status !== 'APPROVED' && candidate.status !== 'POSTED').length ?? 0,
  }), [batch]);

  if (!businessId) {
    return (
      <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
          <p style={{ marginBottom: 0 }}>{businessContextError ?? 'No active business is available for upload processing.'}</p>
        </div>
      </main>
    );
  }

  const parseActiveText = () => {
    if (!businessId) {
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      const nextService = new UploadConvertService(buildDemoEngine(businessId));
      const nextBatch = createBatchFromText(nextService, businessId, fileName, sourceText);

      setService(nextService);
      setBatch(nextBatch);
      setSelectedCandidateId(nextBatch.candidates[0]?.id ?? null);
      setStatus(`Parsed ${nextBatch.candidates.length} records and queued them for review.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The uploaded file could not be parsed.');
      setStatus('Validation failed. Review the file and fix the issues before posting.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleApprove = () => {
    if (!service || !selectedCandidate) {
      setError('Select a review item before approving it.');
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      const approved = service.approveCandidate(selectedCandidate.id, 'demo-user');
      setBatch((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          status: 'APPROVED',
          candidates: current.candidates.map((candidate) => (candidate.id === approved.id ? approved : candidate)),
        };
      });
      setStatus(`Approved ${approved.suggestion.description}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The selected item could not be approved.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePost = () => {
    if (!service || !selectedCandidate) {
      setError('No approved item is ready to post.');
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      const posted = service.postApprovedCandidate(selectedCandidate.id, 'demo-user', businessId);
      setBatch((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          status: 'POSTED',
          candidates: current.candidates.map((candidate) => (candidate.id === selectedCandidate.id ? { ...candidate, status: 'POSTED', auditTrail: [...(candidate.auditTrail ?? []), `Posted ${posted.journalId ?? 'journal'}`] } : candidate)),
        };
      });
      setStatus(`Posted ${posted.description ?? selectedCandidate.suggestion.description} to the ledger.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The approved item could not be posted to the accounting ledger.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !businessId) {
      return;
    }

    const nextText = await file.text();
    setFileName(file.name);
    setSourceText(nextText);

    try {
      setIsBusy(true);
      setError(null);
      const nextService = new UploadConvertService(buildDemoEngine(businessId));
      const validation = nextService.validateFile({ name: file.name, size: file.size, type: file.type || 'application/octet-stream', content: nextText });
      if (!validation.isValid) {
        throw new Error(validation.errors.join(' '));
      }

      const nextBatch = createBatchFromText(nextService, businessId, file.name, nextText);
      setService(nextService);
      setBatch(nextBatch);
      setSelectedCandidateId(nextBatch.candidates[0]?.id ?? null);
      setStatus(`Imported ${nextBatch.candidates.length} rows from ${file.name}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The selected file could not be processed.');
      setStatus('The upload could not be accepted. Check the file format and use the supported document types.');
    } finally {
      setIsBusy(false);
      event.target.value = '';
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
          <p style={{ marginBottom: 0 }}>Review imported statements, receipts and invoices before posting.</p>
          <p style={{ marginBottom: 0, color: '#475569' }}>Business scope: {businessId}</p>
        </div>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
              File selection
              <input type="file" accept=".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileSelection} />
            </label>
            <div style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
              File name
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.7rem 0.8rem' }}>{fileName}</div>
            </div>
          </div>

          <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
            Review text
            <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={10} style={{ resize: 'vertical', fontFamily: 'monospace', border: '1px solid #cbd5e1', borderRadius: 12, padding: '0.8rem' }} />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={parseActiveText} disabled={isBusy} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
              Parse &amp; review
            </button>
            <button type="button" onClick={handleApprove} disabled={!selectedCandidate || selectedCandidate.status === 'APPROVED' || isBusy} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: !selectedCandidate || isBusy ? 'not-allowed' : 'pointer' }}>
              Approve
            </button>
            <button type="button" onClick={handlePost} disabled={!selectedCandidate || selectedCandidate.status !== 'APPROVED' || isBusy} style={{ background: '#dbeafe', color: '#0f172a', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontWeight: 700, cursor: !selectedCandidate || selectedCandidate.status !== 'APPROVED' || isBusy ? 'not-allowed' : 'pointer' }}>
              Post to ledger
            </button>
          </div>

          {error ? (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', padding: '0.75rem 1rem' }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
              <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{previewSummary.pending}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem' }}>
              <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approved</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{previewSummary.matched}</div>
            </div>
          </div>

          <div style={{ color: '#334155', fontWeight: 600 }}>{status}</div>
        </section>

        {batch ? (
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', gap: '1rem' }}>
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                <h2 style={{ margin: 0 }}>Review queue</h2>
                {batch.candidates.length === 0 ? (
                  <div style={{ color: '#475569' }}>No candidates are available for this batch.</div>
                ) : (
                  batch.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: candidate.id === selectedCandidateId ? '#e0f2fe' : '#f8fafc',
                        border: candidate.id === selectedCandidateId ? '1px solid #38bdf8' : '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '0.8rem',
                        color: '#0f172a',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <strong>{candidate.normalized.description}</strong>
                        <span style={{ fontSize: 12, color: '#475569' }}>{candidate.status}</span>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 13, color: '#334155' }}>
                        {candidate.normalized.date} · {candidate.normalized.amount} · {candidate.suggestion.type}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 12, color: '#64748b' }}>
                        {candidate.duplicateStatus === 'NONE' ? 'No duplicate detected' : candidate.duplicateStatus}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {selectedCandidate ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ margin: 0 }}>{selectedCandidate.normalized.description}</h3>
                    <span style={{ background: '#e2e8f0', borderRadius: 999, padding: '0.35rem 0.6rem', fontSize: 12, fontWeight: 700 }}>{selectedCandidate.status}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div><div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div><div>{selectedCandidate.normalized.date}</div></div>
                    <div><div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div><div>{selectedCandidate.normalized.amount}</div></div>
                    <div><div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference</div><div>{selectedCandidate.normalized.reference ?? '—'}</div></div>
                    <div><div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</div><div>{selectedCandidate.confidence}%</div></div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.8rem' }}>
                    <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Suggested mapping</div>
                    <div><strong>Type:</strong> {selectedCandidate.suggestion.type}</div>
                    <div><strong>Account:</strong> {selectedCandidate.suggestion.accountId ?? 'Bank account'}</div>
                    <div><strong>Financial account:</strong> {selectedCandidate.suggestion.financialAccountId ?? 'Demo Bank'}</div>
                    <div><strong>Reference:</strong> {selectedCandidate.suggestion.referenceNo ?? '—'}</div>
                  </div>

                  {selectedCandidate.auditTrail && selectedCandidate.auditTrail.length > 0 ? (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.8rem' }}>
                      <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Audit trail</div>
                      <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.35rem' }}>
                        {selectedCandidate.auditTrail.map((entry) => (
                          <li key={`${selectedCandidate.id}-${entry}`}>{entry}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
