export type AuthSource = 'server' | 'client';

export type MyOpsSessionUser = { id?: string | null } | null;

export type MyOpsAccessDecision = {
  allowed: boolean;
  redirectTo?: string;
  reason?: 'missing_session' | 'expired_session' | 'client_bypass' | 'authenticated';
};

export function validateMyOpsSession(user: MyOpsSessionUser, source: AuthSource = 'server'): boolean {
  if (source !== 'server') {
    throw new Error('Client-side auth bypass attempt rejected. MyOps session must be validated server-side.');
  }

  if (!user || !user.id) {
    throw new Error('MyOps session is required. Redirect the user back to the MyOps login portal.');
  }

  return true;
}

export function getMyOpsAccessDecision({
  pathname,
  user,
  sessionExpired = false,
}: {
  pathname: string;
  user: MyOpsSessionUser;
  sessionExpired?: boolean;
}): MyOpsAccessDecision {
  const isProtectedOpsFinanceRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname === '/accounts' || pathname.startsWith('/accounts/') || pathname === '/transactions' || pathname.startsWith('/transactions/') || pathname === '/upload' || pathname.startsWith('/upload/') || pathname === '/reconciliation' || pathname.startsWith('/reconciliation/') || pathname === '/reports' || pathname.startsWith('/reports/') || pathname === '/settings' || pathname.startsWith('/settings/');

  const isOpsFinanceEntryRoute = pathname === '/opsfinance' || pathname.startsWith('/opsfinance/');

  if (sessionExpired) {
    return { allowed: false, redirectTo: '/', reason: 'expired_session' };
  }

  if (user && user.id) {
    if (isOpsFinanceEntryRoute) {
      return { allowed: true, redirectTo: '/dashboard', reason: 'authenticated' };
    }

    if (pathname === '/login' || pathname === '/register') {
      return { allowed: true, redirectTo: '/', reason: 'authenticated' };
    }

    return { allowed: true, reason: 'authenticated' };
  }

  if (isProtectedOpsFinanceRoute || isOpsFinanceEntryRoute) {
    return { allowed: false, redirectTo: '/', reason: 'missing_session' };
  }

  return { allowed: true };
}
