import { redirect } from 'next/navigation';

import { UploadWorkflow } from '../../components/upload-workflow';
import { AuthenticatedAppShell } from '../../components/authenticated-shell';
import { resolveCurrentBusinessForUser } from '../../lib/auth/business';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const DEMO_MODE = process.env.NODE_ENV !== 'production' && (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.OPSFINANCE_DEMO_MODE === 'true');

export default async function UploadPage() {
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
      <UploadWorkflow businessId={business?.id ?? undefined} businessContextError={businessContextError ?? null} />
    </AuthenticatedAppShell>
  );
}
