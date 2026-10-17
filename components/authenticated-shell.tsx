'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMobileOpen(window.innerWidth <= 900);
    }
  }, [pathname]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/login');
  };

  return (
    <>
      <style>{`
        @media (max-width: 900px) {
          .opsfinance-sidebar { display: none !important; }
          .opsfinance-mobile-toggle { display: inline-flex !important; }
        }
        @media (min-width: 901px) {
          .opsfinance-mobile-toggle { display: none !important; }
        }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', height: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
        <aside
          className="opsfinance-sidebar"
          style={{
            width: 280,
            flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255, 244, 249, 0.98))',
            borderRight: '1px solid rgba(111,108,165,0.15)',
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 800, color: '#6a5bd8', textTransform: 'uppercase' }}>OpsFinance</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1d1b3d' }}>Dashboard</div>
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, rgba(210, 240, 255, 0.8), rgba(243, 220, 255, 0.8))', border: '1px solid rgba(99,90,170,0.15)', borderRadius: 16, padding: '0.75rem 0.8rem', fontSize: 13 }}>
            <div style={{ color: '#1f2344', fontWeight: 700 }}>Current business</div>
            <div style={{ color: '#1d1b3d', marginTop: 4, fontWeight: 700 }}>{businessName ?? 'No active business'}</div>
          </div>

          <NavigationList />

          {userEmail ? (
            <div style={{ marginTop: 'auto', color: '#4d4d6b', fontSize: 12, wordBreak: 'break-word', fontWeight: 700 }}>
              {userEmail}
            </div>
          ) : null}

          <button type="button" onClick={signOut} className="opsfinance-primary-button" style={{ width: '100%' }}>
            Sign out
          </button>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              background: 'rgba(255,255,255,0.82)',
              borderBottom: '1px solid rgba(111,108,165,0.12)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
              flexShrink: 0,
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
                style={{ background: 'linear-gradient(135deg, #ff7aa5, #a56aff)', color: '#fff', border: 'none', borderRadius: 12, padding: '0.55rem 0.7rem', fontWeight: 700 }}
              >
                ☰
              </button>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#6a5bd8', fontWeight: 800, textTransform: 'uppercase' }}>OpsFinance</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#1d1b3d' }}>Authenticated workspace</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ color: '#4d4d6b', fontSize: 13, fontWeight: 700 }}>{businessName ?? 'No active business'}</div>
              <button type="button" onClick={signOut} className="opsfinance-secondary-button">
                Sign out
              </button>
            </div>
          </header>

          {mobileOpen ? (
            <div id="opsfinance-mobile-nav" style={{ background: 'rgba(255,255,255,0.8)', borderBottom: '1px solid rgba(111,108,165,0.12)', padding: '1rem' }}>
              <NavigationList isMobile onNavigate={() => setMobileOpen(false)} />
            </div>
          ) : null}

          <main style={{ flex: 1, padding: '1.5rem 1rem 2rem', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>{children}</main>
        </div>
      </div>
    </>
  );
}
