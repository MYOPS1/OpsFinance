import { describe, expect, it, vi } from 'vitest';

import { navigateToDashboard, navigateToLogin, navigateToMyOpsHome } from '../lib/auth/navigation';

describe('auth navigation', () => {
  it('uses a full document navigation to the dashboard', () => {
    const assign = vi.fn();

    navigateToDashboard(assign);

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith('/dashboard');
  });

  it('routes users back to the MyOps login portal after sign-out', () => {
    const assign = vi.fn();

    navigateToLogin(assign);
    expect(assign).toHaveBeenCalledWith('/?logout=1');

    const home = vi.fn();
    navigateToMyOpsHome(home);
    expect(home).toHaveBeenCalledWith('/');
  });
});
