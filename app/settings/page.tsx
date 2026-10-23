import Link from 'next/link';

import { AuthenticatedAppShell } from '../../components/authenticated-shell';

export default function SettingsPage() {
  return (
    <AuthenticatedAppShell>
      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
        <h1>Settings</h1>
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          <li>
            <Link href="/settings/business" style={{ textDecoration: 'none', fontWeight: 600, color: '#0969da' }}>
              Business Profile
            </Link>
          </li>
          <li>
            <Link href="/settings/accounting" style={{ textDecoration: 'none', fontWeight: 600, color: '#0969da' }}>
              Accounting Settings
            </Link>
          </li>
          <li>
            <Link href="/settings/accounting-rules" style={{ textDecoration: 'none', fontWeight: 600, color: '#0969da' }}>
              Accounting Rules
            </Link>
          </li>
        </ul>
      </main>
    </AuthenticatedAppShell>
  );
}
