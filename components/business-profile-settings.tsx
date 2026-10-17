'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSupabaseBrowserClient } from '../lib/supabase/client';

export type BusinessProfileSettingsProps = {
  businessId: string | null;
  businessContextError?: string | null;
};

export function BusinessProfileSettings({ businessId, businessContextError }: BusinessProfileSettingsProps) {
  const [form, setForm] = useState({
    name: '',
    registrationNo: '',
    address: '',
    phone: '',
    email: '',
    baseCurrency: 'MYR',
    fiscalYearStart: '',
  });
  const [updatedAt, setUpdatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!businessId) {
      setError('No current business is available for this user.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured in this environment.');
      setIsLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message ?? 'Unable to load the business profile.');
      setIsLoading(false);
      return;
    }

    if (!data) {
      setError('No business record is available for this user.');
      setIsLoading(false);
      return;
    }

    setForm({
      name: data.name ?? '',
      registrationNo: data.registration_no ?? '',
      address: data.address ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      baseCurrency: data.base_currency ?? 'MYR',
      fiscalYearStart: data.fiscal_year_start ?? '',
    });
    setUpdatedAt(data.updated_at ?? '');
    setIsLoading(false);
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    if (!businessId) {
      setError('No current business is available for this user.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured in this environment.');
      setIsSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      registration_no: form.registrationNo || null,
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      base_currency: form.baseCurrency || 'MYR',
      fiscal_year_start: form.fiscalYearStart || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error: saveError } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', businessId)
      .select()
      .maybeSingle();

    setIsSaving(false);

    if (saveError) {
      setError(saveError.message ?? 'Unable to save the business profile.');
      return;
    }

    if (!data) {
      setError('The business profile could not be updated.');
      return;
    }

    setForm({
      name: data.name ?? '',
      registrationNo: data.registration_no ?? '',
      address: data.address ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      baseCurrency: data.base_currency ?? 'MYR',
      fiscalYearStart: data.fiscal_year_start ?? '',
    });
    setUpdatedAt(data.updated_at ?? '');
    setSuccess('Business profile saved successfully.');
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '1.5rem 1rem 2.5rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#475569', letterSpacing: '0.08em', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Settings</p>
            <h1 style={{ margin: '0.35rem 0 0', fontSize: 'clamp(2rem, 4vw, 2.5rem)' }}>Business Profile</h1>
          </div>
          <button type="button" onClick={() => void loadProfile()} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '0.7rem 1rem', cursor: 'pointer' }}>Reload profile</button>
        </header>

        {businessContextError ? (
          <div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', borderRadius: 10, padding: '0.75rem' }}>{businessContextError}</div>
        ) : null}

        {!businessId ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.25rem', color: '#475569' }}>No active business is available for this user.</div>
        ) : isLoading ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.25rem', color: '#475569' }}>Loading business profile…</div>
        ) : (
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '1.25rem', display: 'grid', gap: '1rem' }}>
            {error && (
              <div role="alert" style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', borderRadius: 10, padding: '0.75rem' }}>{error}</div>
            )}
            {success && (
              <div role="status" style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '0.75rem' }}>{success}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Business name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Registration no.</span>
                <input value={form.registrationNo} onChange={(event) => setForm((current) => ({ ...current, registrationNo: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Base currency</span>
                <input value={form.baseCurrency} onChange={(event) => setForm((current) => ({ ...current, baseCurrency: event.target.value.toUpperCase() }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Fiscal year start</span>
                <input type="date" value={form.fiscalYearStart} onChange={(event) => setForm((current) => ({ ...current, fiscalYearStart: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem', gridColumn: '1 / -1' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Address</span>
                <textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={4} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem', resize: 'vertical', minHeight: 80 }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Phone</span>
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>Business email</span>
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.7rem 0.8rem' }} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#475569', fontSize: 13 }}>
                Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : 'Not available'}
              </div>
              <button type="button" onClick={() => void handleSave()} disabled={isSaving} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '0.8rem 1.2rem', fontWeight: 700, cursor: 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
