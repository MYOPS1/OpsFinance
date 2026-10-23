import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isPreviewAuthBypassEnabled } from './lib/auth/navigation';
import { getMyOpsAccessDecision } from './lib/auth/myops';

const PUBLIC_PATHS = ['/login', '/register', '/auth/callback', '/opsfinance', '/'];
const PROTECTED_PATH_PREFIXES = ['/dashboard', '/accounts', '/transactions', '/upload', '/reconciliation', '/reports', '/settings'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const pathname = request.nextUrl.pathname;
  const previewBypassEnabled = isPreviewAuthBypassEnabled();

  if (previewBypassEnabled) {
    if (pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/opsfinance') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    const isProtectedPath = PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (isProtectedPath) {
      return response;
    }

    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const pathname = request.nextUrl.pathname;
    if (PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const isPublicPath = PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isProtectedPath = PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isBrowserNavigationRequest =
    request.headers.get('sec-fetch-mode') === 'navigate' ||
    request.headers.get('accept')?.includes('text/html') ||
    request.headers.get('upgrade-insecure-requests') !== null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname === '/login' && !user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/opsfinance' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/opsfinance' && !user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isPublicPath && user && pathname !== '/auth/callback') {
    const decision = getMyOpsAccessDecision({ pathname, user, sessionExpired: false });
    if (decision.redirectTo) {
      return NextResponse.redirect(new URL(decision.redirectTo, request.url));
    }
  }

  const wasSignedOut = request.nextUrl.searchParams.get('logout') === '1';
  if (pathname === '/' && user && wasSignedOut) {
    return response;
  }

  if (pathname === '/' && !user && isBrowserNavigationRequest) {
    return response;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
