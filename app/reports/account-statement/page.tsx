import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { ReportsWorkflow } from '../../../components/reports-workflow';
import { resolveCurrentBusinessForUser } from '../../../lib/auth/business';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function ReportsAccountStatementPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { business, error: businessContextError } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <ReportsWorkflow businessId={business?.id ?? undefined} businessContextError={businessContextError ?? null} defaultReport="statement" />
    </AuthenticatedAppShell>
  );
}
