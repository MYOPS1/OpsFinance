import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { ChartOfAccountsWorkflow } from '../../../components/chart-of-accounts-workflow';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function ChartOfAccountsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id);

  const businessId = memberships?.[0]?.business_id ?? undefined;

  return (
    <AuthenticatedAppShell businessName={memberships?.[0]?.business_id ? 'Business context loaded' : 'No active business'} userEmail={user.email ?? user.id}>
      <ChartOfAccountsWorkflow businessId={businessId} />
    </AuthenticatedAppShell>
  );
}
