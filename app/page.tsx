import { redirect } from 'next/navigation';

import { isPreviewAuthBypassEnabled } from '../lib/auth/navigation';

export default function Page() {
  if (isPreviewAuthBypassEnabled()) {
    redirect('/dashboard');
  }

  redirect('/dashboard');
}
