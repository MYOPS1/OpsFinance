import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export interface BusinessScopeContext {
  businessId: string;
  userId: string;
  memberships?: string[];
}

export function getSupabaseServerConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return { url, anonKey };
}

export function getSupabaseAdminConfig(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin configuration is missing.');
  }

  if (typeof window !== 'undefined') {
    throw new Error('Service role key must never be used in the browser runtime.');
  }

  return { url, serviceRoleKey };
}

export function assertBusinessScope(context: BusinessScopeContext): void {
  if (!context.businessId || !context.userId) {
    throw new Error('Business access denied.');
  }

  const membershipSet = new Set(context.memberships ?? []);
  if (!membershipSet.has(context.businessId)) {
    throw new Error('Business access denied.');
  }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options }));
        } catch {
          // The server component may not allow setting cookies in this context.
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getServerSession() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error };
  }

  return { user: data.user, error: null };
}
