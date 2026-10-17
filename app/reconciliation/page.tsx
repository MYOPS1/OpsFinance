import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../components/authenticated-shell';
import { ReconciliationWorkflow } from '../../components/reconciliation-workflow';
import { resolveCurrentBusinessForUser } from '../../lib/auth/business';
import { isDemoModeEnabled } from '../../lib/runtime/demo-mode';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const DEMO_MODE = isDemoModeEnabled();

export default async function ReconciliationPage() {
  let user: { id: string; email?: string | null } | null = null;
  let business: { id: string; name: string } | null = null;
  let businessContextError: string | null = null;

  if (DEMO_MODE) {
    user = { id: 'demo-user', email: 'demo@opsfinance.local' };
    business = { id: 'demo-business', name: 'Demo Business' };
  } else {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: userData, error } = await supabase.auth.getUser();

      if (error || !userData.user) {
        redirect('/login');
      }

      user = userData.user;
      const result = await resolveCurrentBusinessForUser(supabase, user.id);
      business = result.business;
      businessContextError = result.error;
    } catch {
      redirect('/login');
    }
  }

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user?.email ?? user?.id ?? 'demo@opsfinance.local'}>
      <ReconciliationWorkflow businessId={business?.id ?? undefined} businessContextError={businessContextError ?? null} />
    </AuthenticatedAppShell>
  );
}
