import { NextResponse } from 'next/server';

import { isPreviewAuthBypassEnabled } from '@/lib/auth/navigation';
import { getPreviewBusinessContext, getPreviewFinancialSnapshot, getPreviewStore } from '@/lib/preview-data';

export async function GET() {
  if (!isPreviewAuthBypassEnabled()) {
    return NextResponse.json({ error: 'Preview mode is disabled.' }, { status: 403 });
  }

  const store = getPreviewStore();
  const snapshot = getPreviewFinancialSnapshot();

  return NextResponse.json({
    business: store.business,
    previewContext: getPreviewBusinessContext(),
    accounts: store.accounts,
    financialAccounts: store.financialAccounts,
    journalEntries: store.journalEntries,
    transactions: store.journalEntries,
    snapshot,
  });
}
