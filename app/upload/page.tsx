import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../../lib/auth/navigation';
import { getPreviewBusinessContext } from '../../lib/preview-data';
import { AuthenticatedAppShell } from '../../components/authenticated-shell';
import { resolveCurrentBusinessForUser } from '../../lib/auth/business';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export default async function UploadPage() {
  const previewContext = getPreviewBusinessContext();

  if (isPreviewAuthBypassEnabled()) {
    return (
      <AuthenticatedAppShell businessName={previewContext.businessName} userEmail={previewContext.userEmail}>
        <main style={{ background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
            <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
            <p style={{ marginTop: 0 }}>Parse &amp; review</p>
            <p style={{ marginBottom: 0 }}>Preview business: {previewContext.businessName}</p>
          </div>
        </main>
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
      <main style={{ background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.5rem' }}>
          <h1 style={{ marginTop: 0 }}>Upload &amp; Convert</h1>
          <p style={{ marginTop: 0 }}>Parse &amp; review</p>
          {business ? (
            <p style={{ marginBottom: 0 }}>Upload workflows are gated to the active business: {business.name}.</p>
          ) : (
            <p style={{ marginBottom: 0 }}>{businessContextError ?? 'No active business is available for upload processing.'}</p>
          )}
        </div>
      </main>
    </AuthenticatedAppShell>
  );
}
