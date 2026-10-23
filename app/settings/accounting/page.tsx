import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../../../lib/auth/navigation';
import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { AccountingSettingsPage } from '../../../components/accounting-settings';
import { resolveCurrentBusinessForUser } from '../../../lib/auth/business';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function AccountingSettingsRoute() {
  if (isPreviewAuthBypassEnabled()) {
    redirect('/dashboard');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (isPreviewAuthBypassEnabled()) {
      redirect('/dashboard');
    }
    if (isPreviewAuthBypassEnabled()) {
      redirect('/dashboard');
    }
    redirect('/login');
  }

  const { business, error: businessContextError } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <AccountingSettingsPage businessId={business?.id ?? null} businessContextError={businessContextError ?? null} />
    </AuthenticatedAppShell>
  );
}
