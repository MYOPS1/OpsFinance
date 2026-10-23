import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../../../lib/auth/navigation';
import { getPreviewBusinessContext } from '../../../lib/preview-data';
import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { BusinessProfileSettings } from '../../../components/business-profile-settings';
import { resolveCurrentBusinessForUser } from '../../../lib/auth/business';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function BusinessProfilePage() {
  const previewContext = getPreviewBusinessContext();

  if (isPreviewAuthBypassEnabled()) {
    return (
      <AuthenticatedAppShell businessName={previewContext.businessName} userEmail={previewContext.userEmail}>
        <BusinessProfileSettings businessId={previewContext.businessId} businessContextError={null} />
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

  const { business, error: businessContextError } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <BusinessProfileSettings businessId={business?.id ?? null} businessContextError={businessContextError} />
    </AuthenticatedAppShell>
  );
}
