import { redirect } from 'next/navigation';

import { AuthenticatedAppShell } from '../../../components/authenticated-shell';
import { TransactionWorkflow } from '../../../components/transaction-workflow';
import { resolveCurrentBusinessForUser } from '../../../lib/auth/business';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export default async function TransactionsMoneyInPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { business, context } = await resolveCurrentBusinessForUser(supabase, user.id);

  return (
    <AuthenticatedAppShell businessName={business?.name ?? 'No active business'} userEmail={user.email ?? user.id}>
      <TransactionWorkflow businessId={business?.id ?? context?.businessId ?? undefined} defaultType="MONEY_IN" />
    </AuthenticatedAppShell>
  );
}
