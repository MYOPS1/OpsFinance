import Link from 'next/link';

import { AuthenticatedAppShell } from '../../components/authenticated-shell';

export default function AccountsPage() {
  return (
    <AuthenticatedAppShell>
      <main className="opsfinance-workflow-panel" style={{ padding: '1.5rem 1rem 2rem' }}>
        <div className="opsfinance-workflow-inner" style={{ maxWidth: 900 }}>
          <div className="opsfinance-surface" style={{ padding: '1.5rem' }}>
            <p className="opsfinance-kicker">OpsFinance</p>
            <h1 style={{ margin: '0.35rem 0 0', fontSize: '2rem' }}>Accounts</h1>
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.85rem', marginTop: '1.25rem' }}>
              <li>
                <Link href="/accounts/financial" style={{ fontWeight: 700, color: '#201d3a', display: 'inline-block', padding: '0.75rem 0.9rem', border: '1px solid rgba(106,91,216,0.15)', borderRadius: 12, background: 'rgba(128,110,235,0.05)' }}>Financial Accounts</Link>
              </li>
              <li>
                <Link href="/accounts/chart" style={{ fontWeight: 700, color: '#201d3a', display: 'inline-block', padding: '0.75rem 0.9rem', border: '1px solid rgba(106,91,216,0.15)', borderRadius: 12, background: 'rgba(128,110,235,0.05)' }}>Chart of Accounts</Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
