// @vitest-environment node

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClientMock, getUserMock, cookieAdapter } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
  cookieAdapter: { current: null as null | { getAll: () => Array<{ name: string; value: string }>; setAll: (cookies: Array<{ name: string; value: string; options?: { path?: string } }>) => void } },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

import { middleware } from '../middleware';

describe('auth middleware session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
    cookieAdapter.current = null;
    createServerClientMock.mockImplementation((_url, _key, options) => {
      cookieAdapter.current = options.cookies;
      return { auth: { getUser: getUserMock } };
    });
    getUserMock.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects protected routes without a user to the MyOps login portal', async () => {
    const response = await middleware(new NextRequest('http://localhost/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  it('allows protected routes when getUser returns a user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'test-user' } } });

    const response = await middleware(new NextRequest('http://localhost/dashboard'));

    expect(response.status).toBe(200);
  });

  it('keeps the root MyOps portal accessible without a user', async () => {
    const response = await middleware(new NextRequest('http://localhost/'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps the root MyOps portal accessible to an authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'test-user' } } });

    const response = await middleware(new NextRequest('http://localhost/'));

    expect(response.status).toBe(200);
  });

  it('redirects /login to the MyOps portal for both authenticated and unauthenticated users', async () => {
    const response = await middleware(new NextRequest('http://localhost/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');

    getUserMock.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    const authenticatedResponse = await middleware(new NextRequest('http://localhost/login'));

    expect(authenticatedResponse.status).toBe(307);
    expect(authenticatedResponse.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects the OpsFinance entrypoint to the dashboard when authenticated and to MyOps when unauthenticated', async () => {
    const unauthenticated = await middleware(new NextRequest('http://localhost/opsfinance'));
    expect(unauthenticated.status).toBe(307);
    expect(unauthenticated.headers.get('location')).toBe('http://localhost/');

    getUserMock.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    const authenticated = await middleware(new NextRequest('http://localhost/opsfinance'));
    expect(authenticated.status).toBe(307);
    expect(authenticated.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('passes request cookies to Supabase and writes refreshed cookies to the response', async () => {
    getUserMock.mockImplementation(async () => {
      const incoming = cookieAdapter.current?.getAll() ?? [];
      expect(incoming).toContainEqual({ name: 'sb-test-auth-token', value: 'incoming-cookie' });
      cookieAdapter.current?.setAll([
        { name: 'sb-test-auth-token', value: 'refreshed-cookie', options: { path: '/' } },
      ]);
      return { data: { user: { id: 'test-user' } } };
    });
    const request = new NextRequest('http://localhost/dashboard', {
      headers: { cookie: 'sb-test-auth-token=incoming-cookie' },
    });

    const response = await middleware(request);

    expect(request.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-cookie');
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-cookie');
  });
});
