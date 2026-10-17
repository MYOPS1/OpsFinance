'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearSupabaseSessionStorage, navigateToLogin } from '../lib/auth/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type AuthenticatedAppShellProps = {
  children: React.ReactNode;
  businessName?: string | null;
  userEmail?: string | null;
};

type NavItem = { href: string; label: string };

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  {
    title: 'Transactions',
    items: [
      { href: '/transactions', label: 'All Transactions' },
      { href: '/transactions/money-in', label: 'Money In' },
      { href: '/transactions/money-out', label: 'Money Out' },
      { href: '/transactions/transfer', label: 'Transfer' },
      { href: '/transactions/journal', label: 'Journal Entry' },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { href: '/accounts/financial', label: 'Financial Accounts' },
      { href: '/accounts/chart', label: 'Chart of Accounts' },
    ],
  },
  {
    title: 'Upload & Convert',
    items: [
      { href: '/upload', label: 'Bank Statement' },
      { href: '/upload', label: 'Invoice / Bill' },
      { href: '/upload', label: 'Receipt' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { href: '/reports/profit-loss', label: 'Profit & Loss' },
      { href: '/reports/balance-sheet', label: 'Balance Sheet' },
      { href: '/reports/trial-balance', label: 'Trial Balance' },
      { href: '/reports/general-ledger', label: 'General Ledger' },
      { href: '/reports/account-statement', label: 'Account Statement' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/settings/business', label: 'Business Profile' },
      { href: '/settings/accounting', label: 'Accounting Settings' },
      { href: '/settings/accounting-rules', label: 'Accounting Rules' },
    ],
  },
];

function NavigationList({ isMobile = false, onNavigate }: { isMobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="OpsFinance navigation" style={{ display: 'grid', gap: '1rem' }}>
      {navGroups.map((group) => (
        <div key={group.title} style={{ display: 'grid', gap: '0.45rem' }}>
          <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 0.5rem' }}>
            {group.title}
          </div>
          {group.items.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={`${group.title}-${item.label}`}
                href={item.href}
                onClick={onNavigate}
                style={{
                  textDecoration: 'none',
                  color: isActive ? '#0f172a' : '#334155',
                  background: isActive ? '#e2e8f0' : 'transparent',
                  borderRadius: 10,
                  padding: '0.6rem 0.8rem',
                  fontWeight: 700,
                  display: 'block',
                  border: isActive ? '1px solid #cbd5e1' : '1px solid transparent',
                  ...(isMobile ? { fontSize: 14 } : { fontSize: 14 }),
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AuthenticatedAppShell({ children, businessName, userEmail }: AuthenticatedAppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 900 : false));

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
      setMobileOpen(true);
    }
  }, [pathname]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();

    clearSupabaseSessionStorage();
    navigateToLogin((url) => {
      if (typeof window !== 'undefined') {
        window.location.replace(url);
        return;
      }

      router.replace(url);
    });

    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Sign-out is best-effort; the browser is already navigated back to the login page.
      }
    }
  };

  return (
    <>
      <style jsx>{`
        @media (max-width: 900px) {
          .opsfinance-sidebar { display: none !important; }
          .opsfinance-mobile-toggle { display: inline-flex !important; }
        }
        @media (min-width: 901px) {
          .opsfinance-mobile-toggle { display: none !important; }
        }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
        <aside
          className="opsfinance-sidebar"
          style={{
            width: 280,
            flexShrink: 0,
            background: '#fff',
            borderRight: '1px solid #e2e8f0',
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>OpsFinance</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Dashboard</div>
            </div>
          </div>

          <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 12, padding: '0.7rem 0.8rem', fontSize: 13 }}>
            <div style={{ color: '#0f172a', fontWeight: 700 }}>Current business</div>
            <div style={{ color: '#0f172a', marginTop: 4 }}>{businessName ?? 'No active business'}</div>
          </div>

          <NavigationList />

          {userEmail ? (
            <div style={{ marginTop: 'auto', color: '#475569', fontSize: 12, wordBreak: 'break-word' }}>
              {userEmail}
            </div>
          ) : null}

          <button type="button" onClick={signOut} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
            Sign out
          </button>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              background: '#fff',
              borderBottom: '1px solid #e2e8f0',
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="opsfinance-mobile-toggle"
                onClick={() => setMobileOpen(true)}
                aria-expanded={mobileOpen}
                aria-controls="opsfinance-mobile-nav"
                aria-label="Toggle navigation"
                style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.55rem 0.7rem', fontWeight: 700 }}
              >
                ☰
              </button>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>OpsFinance</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>Authenticated workspace</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>{businessName ?? 'No active business'}</div>
              <button type="button" onClick={signOut} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.55rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          </header>

          {mobileOpen ? (
            <div id="opsfinance-mobile-nav" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '1rem' }}>
              <NavigationList isMobile onNavigate={() => setMobileOpen(false)} />
            </div>
          ) : null}

          <main style={{ padding: '1.5rem 1rem 2rem' }}>{children}</main>
        </div>
      </div>
    </>
  );
}
