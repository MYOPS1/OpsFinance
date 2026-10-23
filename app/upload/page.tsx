'use client';

import { useState } from 'react';

import { AuthenticatedAppShell } from '../../components/authenticated-shell';
import { getPreviewBusinessContext } from '../../lib/preview-data';

type UploadItem = {
  id: string;
  label: string;
  amount: string;
  account: string;
  source: string;
  status: 'Ready' | 'Needs review' | 'Imported';
};

export default function UploadPage() {
  const previewContext = getPreviewBusinessContext();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<UploadItem[]>([]);
  const [isParsed, setIsParsed] = useState(false);
  const [isImported, setIsImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedFormats = ['CSV', 'XLSX', 'PDF', 'OFX', 'QIF'];

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    setIsImported(false);
    setIsParsed(false);
    setParsedRows([]);
  };

  const parseFile = () => {
    if (!selectedFile) {
      setError('Choose a file before parsing.');
      return;
    }

    const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
    const rows: UploadItem[] = [
      {
        id: 'upload-1',
        label: `${baseName} - bank transfer`,
        amount: 'RM 1,250.00',
        account: 'Maybank Operating',
        source: 'BANK_STATEMENT',
        status: 'Ready',
      },
      {
        id: 'upload-2',
        label: `${baseName} - rent payment`,
        amount: 'RM 3,000.00',
        account: 'Rent Expense',
        source: 'BILL',
        status: 'Needs review',
      },
      {
        id: 'upload-3',
        label: `${baseName} - sales receipt`,
        amount: 'RM 540.00',
        account: 'Sales Revenue',
        source: 'RECEIPT',
        status: 'Ready',
      },
    ];

    setParsedRows(rows);
    setIsParsed(true);
    setIsImported(false);
    setError(null);
  };

  const confirmImport = () => {
    if (!selectedFile || parsedRows.length === 0) {
      setError('There are no parsed rows to import.');
      return;
    }

    setIsImported(true);
    setError(null);
  };

  const resetFlow = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setIsParsed(false);
    setIsImported(false);
    setError(null);
  };

  return (
    <AuthenticatedAppShell businessName={previewContext.businessName} userEmail={previewContext.userEmail}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1rem 3rem', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, color: '#2563eb', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>Upload &amp; convert</p>
              <h1 style={{ margin: '0.35rem 0 0', fontSize: '2rem' }}>Import financial documents</h1>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 999, padding: '0.5rem 0.8rem', fontWeight: 700 }}>
              {previewContext.businessName}
            </div>
          </header>

          <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.5rem', fontWeight: 600 }}>
                Select file
                <input
                  type="file"
                  accept=".csv,.xlsx,.pdf,.ofx,.qif"
                  onChange={handleFileSelection}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '0.8rem', background: '#f8fafc' }}
                />
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {acceptedFormats.map((format) => (
                  <span key={format} style={{ border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, padding: '0.35rem 0.7rem', fontSize: 12, fontWeight: 700 }}>
                    {format}
                  </span>
                ))}
              </div>

              {selectedFile ? (
                <div style={{ border: '1px dashed #93c5fd', background: '#f8fbff', borderRadius: 12, padding: '0.9rem 1rem', color: '#1e293b' }}>
                  <strong>Selected file:</strong> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
              ) : (
                <div style={{ border: '1px dashed #cbd5e1', background: '#f8fafc', borderRadius: 12, padding: '0.9rem 1rem', color: '#64748b' }}>
                  Drop a bank statement, invoice, or receipt to begin.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={parseFile} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.8rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
                  Parse &amp; review
                </button>
                <button type="button" onClick={confirmImport} disabled={!isParsed} style={{ background: isParsed ? '#2563eb' : '#dbeafe', color: isParsed ? '#fff' : '#1e3a8a', border: 'none', borderRadius: 10, padding: '0.8rem 1rem', fontWeight: 700, cursor: isParsed ? 'pointer' : 'not-allowed' }}>
                  Confirm import
                </button>
                <button type="button" onClick={resetFlow} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.8rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
                  Reset
                </button>
              </div>

              {error ? <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '0.7rem 0.9rem' }}>{error}</div> : null}
            </div>
          </section>

          <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Review extracted rows</h2>
              {isImported ? <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '0.4rem 0.7rem', fontWeight: 700 }}>Import posted to preview ledger</span> : null}
            </div>

            {isParsed && parsedRows.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.8rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '0.8rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                      <th style={{ textAlign: 'left', padding: '0.8rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Account</th>
                      <th style={{ textAlign: 'left', padding: '0.8rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Source</th>
                      <th style={{ textAlign: 'left', padding: '0.8rem 0.6rem', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '0.8rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{row.label}</td>
                        <td style={{ padding: '0.8rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{row.amount}</td>
                        <td style={{ padding: '0.8rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{row.account}</td>
                        <td style={{ padding: '0.8rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{row.source}</td>
                        <td style={{ padding: '0.8rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ background: row.status === 'Imported' ? '#dcfce7' : row.status === 'Needs review' ? '#fef3c7' : '#dbeafe', color: row.status === 'Imported' ? '#166534' : row.status === 'Needs review' ? '#92400e' : '#1d4ed8', borderRadius: 999, padding: '0.3rem 0.6rem', fontWeight: 700 }}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>No rows parsed yet. Upload a file and continue with the review flow.</p>
            )}
          </section>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
