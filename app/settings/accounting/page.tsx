import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { AccountingSettingsPage } from '../../../components/accounting-settings';
import { resolveCurrentBusinessForUser } from '../../../lib/auth/business';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function AccountingSettingsRoute() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { business, error: businessContextError } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <AccountingSettingsPage businessId={business?.id ?? null} businessContextError={businessContextError ?? null} />
    </AuthenticatedAppShell>
  );
}
