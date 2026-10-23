'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { navigateToDashboard } from '../../lib/auth/navigation';
import { normalizeAuthError } from '../../lib/auth/session';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function RegisterPage() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const name = String(formData.get('name') ?? '').trim();

    if (!email || !password || !name) {
      setError('Please provide your name, email, and password.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured in this environment.');
      return;
    }

    setPending(true);
    setError('');
    setStatus('');

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: name,
        },
      },
    });

    setPending(false);

    if (authError) {
      setError(normalizeAuthError(authError));
      return;
    }

    if (data.session) {
      setStatus('Account created successfully.');
      navigateToDashboard();
      return;
    }

    setStatus('Account created. Please check your email to confirm your account before signing in.');
  };

  return (
    <main className="tenant-auth-viewport">
      <div className="tenant-auth-shell">
        <section className="tenant-auth-visual">
          <div className="tenant-auth-brand">
            <div className="tenant-brand-mark">
              <Image src="/favicon.svg" alt="MYOPS brand mark" width={32} height={32} />
            </div>
            <span>MYOPS</span>
          </div>

          <div className="tenant-auth-illustration" aria-label="OpsFinance dashboard product card illustration">
            <div className="tenant-product-surface">
              <div className="tenant-surface-header">
                <span className="tenant-dot" />
                <span className="tenant-dot" />
                <span className="tenant-dot" />
              </div>

              <div className="tenant-product-window">
                <div className="tenant-karma-row">
                  <div className="tenant-metric-pill accent-pink">
                    <span>Revenue</span>
                    <strong>RM 48.2k</strong>
                  </div>
                  <div className="tenant-metric-pill accent-gold">
                    <span>Expenses</span>
                    <strong>RM 21.5k</strong>
                  </div>
                </div>

                <div className="tenant-chart-panel">
                  <div className="tenant-chart-bars" aria-hidden="true">
                    <span style={{ height: '32%' }} />
                    <span style={{ height: '48%' }} />
                    <span style={{ height: '67%' }} />
                    <span style={{ height: '58%' }} />
                    <span style={{ height: '89%' }} />
                    <span style={{ height: '72%' }} />
                    <span style={{ height: '100%' }} />
                  </div>
                  <div className="tenant-ring">
                    <div className="tenant-ring-inner">
                      <strong>76%</strong>
                    </div>
                  </div>
                </div>

                <div className="tenant-summary-row">
                  <div className="tenant-summary-card soft">
                    <span>Cash</span>
                    <strong>RM 26.7k</strong>
                  </div>
                  <div className="tenant-summary-card">
                    <span>Growth</span>
                    <strong>+12.4%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="tenant-floating-card top-left">
              <span>Cash balance</span>
              <strong>RM 63,240</strong>
            </div>
            <div className="tenant-floating-card bottom-left">
              <span>Invoices</span>
              <strong>12 new</strong>
            </div>
            <div className="tenant-floating-card bottom-right">
              <span>Trend</span>
              <strong>+18.2%</strong>
            </div>
          </div>

          <div className="tenant-auth-copy">
            <div className="eyebrow">OpsFinance</div>
            <h1>Build a clearer financial picture.</h1>
            <p>Create your workspace and bring together accounting, cash flow, and operational reporting in a single view.</p>
          </div>

          <Image src="/myops-logo-wordmark.png" alt="MYOPS logo" className="tenant-brand-logo" width={320} height={120} />
        </section>

        <section className="tenant-auth-form-panel">
          <div className="tenant-auth-card">
            <h2>Create account</h2>
            <p>Register to start using OpsFinance.</p>

            <form onSubmit={handleSubmit} method="post" className="tenant-form">
              <div className="tenant-field">
                <label htmlFor="name">Name</label>
                <input id="name" type="text" name="name" autoComplete="name" />
              </div>

              <div className="tenant-field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" name="email" autoComplete="email" />
              </div>

              <div className="tenant-field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" name="password" autoComplete="new-password" />
              </div>

              <button type="submit" className="brand-button" disabled={pending}>
                {pending ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            {status ? <p className="tenant-inline-message status">{status}</p> : null}
            {error ? <p className="tenant-inline-message error">{error}</p> : null}

            <div className="tenant-auth-footer">
              <span>Already have an account? <Link href="/login">Sign in</Link></span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
