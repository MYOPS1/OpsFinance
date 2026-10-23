import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../../../lib/auth/navigation';
import { getPreviewBusinessContext } from '../../../lib/preview-data';
import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { ChartOfAccountsWorkflow } from '../../../components/chart-of-accounts-workflow';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function ChartOfAccountsPage() {
  const previewContext = getPreviewBusinessContext();

  if (isPreviewAuthBypassEnabled()) {
    return (
      <AuthenticatedAppShell businessName={previewContext.businessName} userEmail={previewContext.userEmail}>
        <ChartOfAccountsWorkflow businessId={previewContext.businessId} />
      </AuthenticatedAppShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (isPreviewAuthBypassEnabled()) {
      return (
        <AuthenticatedAppShell businessName='Preview business' userEmail='preview@opsfinance.local'>
          <div style={{ padding: '1rem' }}>
            <p>Preview development mode enabled.</p>
            <p>No authentication is required while this feature branch is being tested in Preview.</p>
          </div>
        </AuthenticatedAppShell>
      );
    }
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
