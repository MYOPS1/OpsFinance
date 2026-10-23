'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isPreviewAuthBypassEnabled, navigateToDashboard, navigateToMyOpsHome } from '../../lib/auth/navigation';
import { normalizeAuthError } from '../../lib/auth/session';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const previewBypass = isPreviewAuthBypassEnabled();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (previewBypass) {
      navigateToDashboard();
    }
  }, [previewBypass]);

  if (previewBypass && typeof window !== 'undefined') {
    window.location.replace('/dashboard');
    return null;
  }

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
      navigateToMyOpsHome();
      return;
    }

    setError('No active session was returned. Please try again.');
  };

  return (
    <main className="opsfinance-login-viewport">
      <h1 className="sr-only">Login</h1>
      <div className="opsfinance-login-card">
        <header className="opsfinance-login-brand" aria-label="OpsFinance logo">
          <div className="opsfinance-login-mark">
            <Image src="/favicon.svg" alt="OpsFinance logo" width={28} height={28} priority />
          </div>
        </header>

        <div className="opsfinance-login-visual" aria-label="Finance dashboard illustration">
          <Image
            src="/opsone-reference.png"
            alt="Professional accounting dashboard illustration"
            className="opsfinance-login-illustration"
            width={780}
            height={780}
            priority
          />
        </div>

        <form onSubmit={handleSubmit} method="post" className="opsfinance-login-form">
          <div className="opsfinance-login-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" name="email" autoComplete="email" />
          </div>

          <div className="opsfinance-login-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="password" autoComplete="current-password" />
          </div>

          <button type="submit" className="opsfinance-login-button" disabled={pending}>
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {status ? <p className="opsfinance-login-message success">{status}</p> : null}
        {error ? <p className="opsfinance-login-message error">{error}</p> : null}

        <div className="opsfinance-login-links">
          <Link href="/login?forgot=1">Forgot Password</Link>
          <Link href="/register">Register / Create Account</Link>
        </div>
      </div>
    </main>
  );
}
