import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseBrowserClientMock, navigateToMyOpsHomeMock, signInWithPasswordMock } = vi.hoisted(() => ({
  getSupabaseBrowserClientMock: vi.fn(),
  navigateToMyOpsHomeMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}));

vi.mock('../lib/auth/navigation', () => ({
  isPreviewAuthBypassEnabled: () => false,
  navigateToDashboard: vi.fn(),
  navigateToMyOpsHome: navigateToMyOpsHomeMock,
}));

import LoginPage from '../app/login/page';

describe('login flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('React', React);
    getSupabaseBrowserClientMock.mockReturnValue({
      auth: { signInWithPassword: signInWithPasswordMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function submitLogin() {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'uat@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalledOnce());
  }

  it('submits valid form values to Supabase exactly once and navigates after a session', async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });
    render(createElement(LoginPage));

    await submitLogin();

    expect(getSupabaseBrowserClientMock).toHaveBeenCalledOnce();
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'uat@example.test',
      password: 'test-only-password',
    });
    expect(navigateToMyOpsHomeMock).toHaveBeenCalledOnce();
  });

  it('prevents native get navigation and calls Supabase sign-in on submit', async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });
    window.history.replaceState({}, '', '/login');
    render(createElement(LoginPage));

    const submitButton = screen.getByRole('button', { name: 'Sign in' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    expect((submitButton as HTMLButtonElement).type).toBe('submit');
    expect(form?.getAttribute('action')).toBeNull();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'uat@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } });
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('');
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'uat@example.test',
      password: 'test-only-password',
    });
  });

  it('starts one sign-in request before showing the pending state', async () => {
    let resolveSignIn: (result: {
      data: { session: null };
      error: { message: string } | null;
    }) => void = () => {};
    signInWithPasswordMock.mockReturnValue(new Promise((resolve) => {
      resolveSignIn = resolve;
    }));
    render(createElement(LoginPage));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'uat@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(signInWithPasswordMock).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Signing in...' }) as HTMLButtonElement).disabled).toBe(true);
    resolveSignIn({ data: { session: null }, error: null });
    expect(await screen.findByText(/no active session was returned/i)).toBeTruthy();
  });

  it('does not navigate after an authentication error', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    render(createElement(LoginPage));

    await submitLogin();

    expect(navigateToMyOpsHomeMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/email or password is incorrect/i)).toBeTruthy();
  });

  it('does not navigate when no session is returned', async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { session: null }, error: null });
    render(createElement(LoginPage));

    await submitLogin();

    expect(navigateToMyOpsHomeMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/no active session was returned/i)).toBeTruthy();
  });
});
