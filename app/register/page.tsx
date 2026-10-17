'use client';

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
    <main className="opsfinance-auth-page">
      <div className="opsfinance-auth-card">
        <div className="opsfinance-auth-form-wrap">
          <div className="opsfinance-brand-lockup">
            <div className="opsfinance-brand-mark">OF</div>
            <div className="opsfinance-brand-text">OpsFinance</div>
          </div>

          <h1 className="opsfinance-auth-title">Register</h1>
          <p className="opsfinance-auth-copy">Create your business workspace and start tracking your books in minutes.</p>

          <form className="opsfinance-auth-form" onSubmit={handleSubmit} method="post">
            <div className="opsfinance-auth-field">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" name="name" placeholder="Your full name" autoComplete="name" />
            </div>

            <div className="opsfinance-auth-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" name="email" placeholder="you@example.com" autoComplete="email" />
            </div>

            <div className="opsfinance-auth-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" name="password" placeholder="Create a password" autoComplete="new-password" />
            </div>

            <button type="submit" className="opsfinance-primary-button width-full" disabled={pending}>
              {pending ? 'Creating account...' : 'Create account'}
            </button>

            <button type="button" className="opsfinance-secondary-button width-full" onClick={() => window.location.assign('/login')}>
              Back to sign in
            </button>
          </form>

          {status ? <p className="opsfinance-alert opsfinance-alert-success">{status}</p> : null}
          {error ? <p className="opsfinance-alert opsfinance-alert-error">{error}</p> : null}

          <p className="opsfinance-signup-prompt">
            Already have an account? <button type="button" className="opsfinance-help-link opsfinance-inline-button" onClick={() => window.location.assign('/login')}>Log in</button>
          </p>
        </div>

        <div className="opsfinance-auth-side opsfinance-auth-side--brand" aria-hidden="true">
          <div className="opsfinance-hero-bubble">Build a<br />clearer<br />financial<br />picture</div>

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
