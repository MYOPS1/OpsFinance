import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../lib/supabase/server';

export default async function OpsFinanceLandingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  redirect('/dashboard');
}
