import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../components/authenticated-shell';
import { DashboardWorkflow } from '../../components/dashboard-workflow';
import { resolveCurrentBusinessForUser } from '../../lib/auth/business';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { business, error: contextError } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <DashboardWorkflow businessId={business?.id ?? undefined} businessName={business?.name ?? 'No active business'} />
      <div style={{ padding: '1rem 0 0' }}>
        <p>Authenticated user: {user.email ?? user.id}</p>
        <p>{business ? `Current business: ${business.name}` : 'No business is yet linked to this user. A real business is being resolved from Supabase.'}</p>
        {contextError ? <p style={{ color: '#b91c1c' }}>{contextError}</p> : null}
      </div>
    </AuthenticatedAppShell>
  );
}
