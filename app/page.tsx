import Link from 'next/link';

import LoginPage from './login/page';
import { createSupabaseServerClient } from '../lib/supabase/server';

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LoginPage />;
  }

  return (
    <main className="opsfinance-portal-shell" style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div className="opsfinance-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p className="opsfinance-section-kicker">MyOps</p>
            <h1 style={{ margin: 0 }}>App launcher</h1>
          </div>
          <Link href="/" className="opsfinance-signout" style={{ textDecoration: 'none' }}>
            Home
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <Link href="/opsfinance" className="opsfinance-stat-card" style={{ textDecoration: 'none', padding: '1.5rem', display: 'block' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '0.75rem' }}>Finance</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>OpsFinance</div>
            <div style={{ color: '#475569' }}>Launch accounting workspace</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
