import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../../lib/auth/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export default async function OpsFinanceLandingPage() {
  if (isPreviewAuthBypassEnabled()) {
    redirect('/dashboard');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isPreviewAuthBypassEnabled()) {
      redirect('/dashboard');
    }
    redirect('/');
  }

  redirect('/dashboard');
}
