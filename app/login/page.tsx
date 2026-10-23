'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { navigateToDashboard } from '../../lib/auth/navigation';
import { normalizeAuthError } from '../../lib/auth/session';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      setError('Please provide both email and password.');
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

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setPending(false);

    if (authError) {
      setError(normalizeAuthError(authError));
      return;
    }

    if (data.session) {
      setStatus('Signed in successfully.');
      navigateToDashboard();
      return;
    }

    setError('No active session was returned. Please try again.');
  };

  return (
    <main className="tenant-auth-viewport">
      <h1 className="sr-only">Login</h1>
      <div className="tenant-auth-shell">
        <section className="tenant-auth-visual">
          <div className="tenant-auth-brand">
            <div className="tenant-brand-mark">
              <Image src="/favicon.svg" alt="MYOPS brand mark" width={32} height={32} />
            </div>
            <span>MYOPS</span>
          </div>

          <div className="tenant-auth-illustration" aria-label="OpsFinance product card artwork">
            <div className="tenant-auth-art-frame">
              <Image
                src="/opsone-reference.png"
                alt="OpsFinance product card illustration"
                className="tenant-auth-art"
                width={760}
                height={760}
                priority
              />
            </div>
          </div>

          <div className="tenant-auth-copy">
            <div className="eyebrow">OpsFinance</div>
            <h1>Unified operational finance.</h1>
            <p>Track cash flow, accounting records, and business operations with a clean workspace built for modern teams.</p>
          </div>

          <Image src="/myops-logo-wordmark.png" alt="MYOPS logo" className="tenant-brand-logo" width={320} height={120} />
        </section>

        <section className="tenant-auth-form-panel">
          <div className="tenant-auth-card">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your OpsFinance workspace.</p>

            <form onSubmit={handleSubmit} method="post" className="tenant-form">
              <div className="tenant-field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" name="email" autoComplete="email" />
              </div>

              <div className="tenant-field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" name="password" autoComplete="current-password" />
              </div>

              <button type="submit" className="brand-button" disabled={pending}>
                {pending ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            {status ? <p className="tenant-inline-message status">{status}</p> : null}
            {error ? <p className="tenant-inline-message error">{error}</p> : null}

            <div className="tenant-auth-footer">
              <span>Need an account? <Link href="/register">Create one</Link></span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
