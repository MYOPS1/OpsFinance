import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/auth/callback', '/opsfinance', '/'];
const PROTECTED_PATH_PREFIXES = ['/dashboard', '/accounts', '/transactions', '/upload', '/reconciliation', '/reports', '/settings'];

const DEMO_MODE = process.env.NODE_ENV !== 'production' && (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.OPSFINANCE_DEMO_MODE === 'true');

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  if (DEMO_MODE) {
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

  const pathname = request.nextUrl.pathname;
  const isRootPath = pathname === '/';
  const isMarketingPath = pathname === '/opsfinance' || pathname.startsWith('/opsfinance/');
  const isPublicPath = PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isProtectedPath = PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isRootPath) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isMarketingPath) {
    return response;
  }

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const wasSignedOut = request.nextUrl.searchParams.get('logout') === '1';

  if (isPublicPath && user && pathname !== '/auth/callback' && !wasSignedOut) {
    const redirectTarget = request.nextUrl.searchParams.get('redirect') ?? '/dashboard';
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
