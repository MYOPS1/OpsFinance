import { describe, expect, it } from 'vitest';

import {
  getSupabasePublicConfig,
  isProtectedRoute,
  normalizeAuthError,
  shouldRedirectToLogin,
} from '../lib/auth/session';
import { getMyOpsAccessDecision, validateMyOpsSession } from '../lib/auth/myops';

describe('auth app wiring', () => {
  it('requires browser auth configuration before creating a client', () => {
    expect(getSupabasePublicConfig({})).toMatchObject({ isConfigured: false });
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    })).toMatchObject({ isConfigured: true });
  });

  it('protects authenticated routes and allows public auth pages', () => {
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/settings/business')).toBe(true);
    expect(isProtectedRoute('/login')).toBe(false);
    expect(isProtectedRoute('/register')).toBe(false);
    expect(shouldRedirectToLogin('/dashboard', null)).toBe(true);
    expect(shouldRedirectToLogin('/dashboard', { user: { id: 'user-123' } })).toBe(false);
  });

  it('routes authenticated MyOps users into OpsFinance and redirects unauthenticated access back to MyOps', () => {
    expect(getMyOpsAccessDecision({ pathname: '/opsfinance', user: { id: 'user-123' } })).toMatchObject({ allowed: true, redirectTo: '/dashboard' });
    expect(getMyOpsAccessDecision({ pathname: '/opsfinance', user: null })).toMatchObject({ allowed: false, redirectTo: '/' });
    expect(getMyOpsAccessDecision({ pathname: '/dashboard', user: null })).toMatchObject({ allowed: false, redirectTo: '/' });
  });

  it('rejects expired sessions and client-side bypass attempts before any protected route renders', () => {
    expect(getMyOpsAccessDecision({ pathname: '/dashboard', user: null, sessionExpired: true })).toMatchObject({ allowed: false, redirectTo: '/' });
    expect(() => validateMyOpsSession({ id: 'user-123' }, 'server')).not.toThrow();
    expect(() => validateMyOpsSession(null, 'client')).toThrow(/Client-side auth bypass attempt rejected/i);
  });

  it('normalizes login and session errors into safe user-facing messages', () => {
    expect(normalizeAuthError({ message: 'Invalid login credentials' })).toMatch(/login|credential|email|password/i);
    expect(normalizeAuthError({ message: 'Email not confirmed' })).toMatch(/confirm|email/i);
    expect(normalizeAuthError()).toMatch(/try again|check your email|session/i);
  });
});
