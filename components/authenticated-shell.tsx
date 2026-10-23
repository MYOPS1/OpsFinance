'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { isPreviewAuthBypassEnabled } from '../lib/auth/navigation';
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
    <nav aria-label="OpsFinance navigation" className="opsfinance-nav">
      {navGroups.map((group) => (
        <div key={group.title} className="opsfinance-nav-group">
          <div className="opsfinance-nav-label">{group.title}</div>
          {group.items.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={`${group.title}-${item.label}`}
                href={item.href}
                onClick={onNavigate}
                className={isActive ? 'opsfinance-nav-link active' : 'opsfinance-nav-link'}
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
    if (typeof window !== 'undefined' && window.innerWidth > 900) {
      setMobileOpen(false);
    }
  }, [pathname]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push(isPreviewAuthBypassEnabled() ? '/dashboard' : '/login');
  };

  return (
    <div className="opsfinance-app-shell">
      <aside className="opsfinance-sidebar">
        <div className="opsfinance-sidebar-header">
          <div className="opsfinance-sidebar-brand">
            <div className="opsfinance-brand-badge">
              <Image src="/favicon.svg" alt="MYOPS brand mark" width={18} height={18} />
            </div>
            <div className="opsfinance-brand-copy">
              <strong>OpsFinance</strong>
              <span>Dashboard</span>
            </div>
          </div>
        </div>

        <div className="opsfinance-business-card">
          <label>Current business</label>
          <strong>{businessName ?? 'No active business'}</strong>
        </div>

        <NavigationList />

        {userEmail ? <div className="opsfinance-user-block">{userEmail}</div> : null}

        <button type="button" onClick={signOut} className="opsfinance-signout">
          Sign out
        </button>
      </aside>

      <div className="opsfinance-main-panel">
        <header className="opsfinance-topbar">
          <div className="opsfinance-topbar-left">
            <button
              type="button"
              className="opsfinance-mobile-toggle"
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-controls="opsfinance-mobile-nav"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <div className="opsfinance-topbar-copy">
              <strong>OpsFinance</strong>
              <span>Authenticated workspace</span>
            </div>
          </div>

          <div className="opsfinance-topbar-meta">
            <div className="opsfinance-business-pill">{businessName ?? 'No active business'}</div>
            <button type="button" onClick={signOut} className="opsfinance-signout">
              Sign out
            </button>
          </div>
        </header>

        {mobileOpen ? (
          <div id="opsfinance-mobile-nav" style={{ padding: '1rem 1rem 0' }}>
            <div className="opsfinance-business-card" style={{ marginBottom: '0.75rem' }}>
              <label>Current business</label>
              <strong>{businessName ?? 'No active business'}</strong>
            </div>
            <NavigationList isMobile onNavigate={() => setMobileOpen(false)} />
          </div>
        ) : null}

        <main className="opsfinance-content" style={{ overflowY: 'auto', overflowX: 'hidden' }}>{children}</main>
      </div>
    </div>
  );
}
