'use client';

import React from 'react';

export function SubscriptionSettings() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Standalone accounting access</h1>
      <p style={{ marginTop: '1rem', lineHeight: 1.6 }}>
        OpsFinance no longer uses subscription billing as an access gate for accounting features.
        Billing data is retained only for compatibility and platform records, while business access is
        controlled by Supabase authentication, business membership checks, tenant isolation, and RLS.
      </p>
      <div style={{ marginTop: '1.5rem', border: '1px solid #d0d7de', borderRadius: 12, padding: '1rem 1.25rem', background: '#fff' }}>
        <strong>Compatibility note:</strong> legacy subscription code remains isolated and disconnected from
        accounting authorization. It is intentionally not used to block reports, accounts, journals,
        uploads, or reconciliation in the standalone product.
      </div>
    </main>
  );
}
