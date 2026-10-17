'use client';

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
    <main className="opsfinance-auth-page">
      <div className="opsfinance-auth-card">
        <div className="opsfinance-auth-form-wrap">
          <div className="opsfinance-brand-lockup">
            <div className="opsfinance-brand-mark">OF</div>
            <div className="opsfinance-brand-text">OpsFinance</div>
          </div>

          <h1 className="opsfinance-auth-title">Login</h1>
          <p className="opsfinance-auth-copy">Sign in to your OpsFinance account</p>

          <form className="opsfinance-auth-form" onSubmit={handleSubmit} method="post">
            <div className="opsfinance-auth-field">
              <label htmlFor="email">
                Email
              </label>
              <input id="email" type="email" name="email" placeholder="Enter your email" autoComplete="email" />
            </div>

            <div className="opsfinance-auth-field">
              <div className="opsfinance-auth-row">
                <label htmlFor="password">Password</label>
                <button type="button" className="opsfinance-help-link" onClick={() => window.location.assign('/register')}>
                  Forgot password?
                </button>
              </div>
              <input id="password" type="password" name="password" placeholder="Enter your password" autoComplete="current-password" />
            </div>

            <label className="opsfinance-checkbox-row">
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>

            <button type="submit" className="opsfinance-primary-button width-full" disabled={pending}>
              {pending ? 'Signing in...' : 'Sign in'}
            </button>

            <button type="button" className="opsfinance-secondary-button width-full" onClick={() => window.location.assign('/register')}>
              Create account
            </button>
          </form>

          {status ? <p className="opsfinance-alert opsfinance-alert-success">{status}</p> : null}
          {error ? <p className="opsfinance-alert opsfinance-alert-error">{error}</p> : null}

          <p className="opsfinance-signup-prompt">
            Don&apos;t have an account? <button type="button" className="opsfinance-help-link opsfinance-inline-button" onClick={() => window.location.assign('/register')}>Sign up</button>
          </p>
        </div>

        <div className="opsfinance-auth-side opsfinance-auth-side--brand" aria-hidden="true">
          <div className="opsfinance-hero-bubble">Simple<br />Accounting<br />for your<br />Business</div>

          <div className="opsfinance-illustration-wrap">
            <div className="opsfinance-figure opsfinance-figure--person opsfinance-figure--left">
              <div className="opsfinance-head" />
              <div className="opsfinance-body" />
              <div className="opsfinance-laptop" />
            </div>

            <div className="opsfinance-figure opsfinance-figure--person opsfinance-figure--right">
              <div className="opsfinance-head" />
              <div className="opsfinance-body" />
              <div className="opsfinance-laptop" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
