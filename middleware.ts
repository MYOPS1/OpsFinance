import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isPreviewAuthBypassEnabled } from './lib/auth/navigation';

const PROTECTED_PATH_PREFIXES = ['/dashboard', '/accounts', '/transactions', '/upload', '/reconciliation', '/reports', '/settings'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const pathname = request.nextUrl.pathname;
  const previewBypassEnabled = isPreviewAuthBypassEnabled();

  if (previewBypassEnabled) {
    if (pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/opsfinance') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const pathname = request.nextUrl.pathname;
    if (PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(new URL('/login', request.url));
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

  const isProtectedPath = PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const redirectWithCookies = (path: string) => {
    const redirected = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
    return redirected;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if ((pathname === '/login' || pathname === '/register') && user) {
    return redirectWithCookies('/dashboard');
  }
  if (pathname === '/opsfinance') {
    return redirectWithCookies(user ? '/dashboard' : '/login');
  }
  if (isProtectedPath && !user) {
    return redirectWithCookies('/login');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
