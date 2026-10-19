import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertBusinessMembership,
  getSupabaseRuntimeConfig,
  isPostedAccountingStatus,
  validateJournalMutationSafety,
} from '../packages/supabase-foundation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Phase 10A supabase foundation', () => {
  it('reports missing environment config safely when credentials are not configured', () => {
    const config = getSupabaseRuntimeConfig({
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_PROJECT_ID: '',
      DATABASE_URL: '',
    });

    expect(config.isConfigured).toBe(false);
    expect(config.missingVars.length).toBeGreaterThan(0);
  });

  it('accepts a valid business membership context', () => {
    expect(() => assertBusinessMembership({ userId: 'user-1', businessId: 'business-1', memberships: ['business-1'] }, 'business-1')).not.toThrow();
  });

  it('rejects service-role use in browser-only contexts', async () => {
    const { assertNoServiceRoleKeyInBrowser } = await import('../lib/supabase/client');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    expect(() => assertNoServiceRoleKeyInBrowser()).toThrow('Service role key must never be used in the browser runtime.');
  });

  it('rejects cross-business access in a business-scoped context', () => {
    expect(() => assertBusinessMembership({ userId: 'user-1', businessId: 'business-1', memberships: ['business-1'] }, 'business-2')).toThrow('Business access denied');
  });

  it('treats posted journal states as immutable', () => {
    expect(isPostedAccountingStatus('POSTED')).toBe(true);
    expect(isPostedAccountingStatus('DRAFT')).toBe(false);
  });

  it('blocks mutation on posted journal entries and lines', () => {
    expect(() => validateJournalMutationSafety({ status: 'POSTED', journalEntryId: 'je-1' })).toThrow('Posted journal entries are immutable');
    expect(() => validateJournalMutationSafety({ status: 'POSTED', journalEntryId: 'je-1', entityType: 'JOURNAL_LINE' })).toThrow('Posted journal lines are immutable');
    expect(() => validateJournalMutationSafety({ status: 'APPROVED', journalEntryId: 'je-1' })).not.toThrow();
  });

  it('documents the immutability guard in the migration file', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/003_phase10a_supabase_foundation.sql'), 'utf8');

    expect(migration).toContain('Posted journal entries are immutable');
    expect(migration).toContain('Posted journal lines are immutable');
    expect(migration).toContain('journal_entries');
    expect(migration).toContain('journal_lines');
  });

  it('blocks updates and deletes of posted journal entries while allowing posting', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/003_phase10a_supabase_foundation.sql'), 'utf8');
    const guard = migration.match(/function public\.prevent_posted_journal_mutation\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
    const trigger = migration.match(/create trigger journal_entries_prevent_posted_update[\s\S]*?;/i)?.[0] ?? '';

    expect(guard).toContain("if old.status = 'POSTED'");
    expect(guard).toContain("if tg_op = 'INSERT'");
    expect(guard).toContain("if tg_op = 'DELETE'");
    expect(guard).not.toContain('new.journal_entry_id');
    expect(trigger).toContain('before insert or update or delete on public.journal_entries');
  });

  it('blocks updates and deletes of lines belonging to posted journals', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/003_phase10a_supabase_foundation.sql'), 'utf8');
    const guard = migration.match(/function public\.prevent_posted_journal_line_mutation\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
    const trigger = migration.match(/create trigger journal_lines_prevent_posted_update[\s\S]*?;/i)?.[0] ?? '';

    expect(guard).toContain('old.journal_entry_id');
    expect(guard).toContain('new.journal_entry_id');
    expect(guard).toContain("if tg_op = 'INSERT'");
    expect(guard).toContain("if tg_op = 'DELETE'");
    expect(guard).toContain("je.status = 'POSTED'");
    expect(trigger).toContain('before insert or update or delete on public.journal_lines');
  });

  it('uses an empty search path for every security-definer migration helper', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/003_phase10a_supabase_foundation.sql'), 'utf8');
    const functions = migration.split(/create or replace function /i).slice(1);

    expect(functions.length).toBeGreaterThan(0);
    for (const definition of functions) {
      expect(definition).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    }
  });

  it('documents the durable accounting idempotency and atomic posting contract in the active migration', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/005_accounting_atomic_persistence.sql'), 'utf8');

    expect(migration).toContain('idempotency_keys');
    expect(migration).toContain('post_accounting_transaction_atomic');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('idempotency_key');
  });

  it('keeps idempotency table access behind authenticated RPC execution only', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/016_security_hardening_idempotency_and_rpcs.sql'), 'utf8');

    expect(migration).toContain('revoke all on table public.idempotency_keys from service_role;');
    expect(migration).toContain('grant execute on function public.get_accounting_idempotency');
    expect(migration).toContain('grant execute on function public.post_accounting_transaction_atomic');
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain('GRANT ALL ON TABLE public.idempotency_keys TO service_role');
    expect(migration).not.toContain('grant all on table public.idempotency_keys to service_role');
  });

  it('requires authenticated business membership for idempotency lookups and atomic posting RPCs', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/016_security_hardening_idempotency_and_rpcs.sql'), 'utf8');

    expect(migration).toContain("if v_user_id is null then\n    raise exception 'Authentication required';");
    expect(migration).toContain("if not exists (\n    select 1\n    from public.business_members bm\n    where bm.business_id = p_business_id\n      and bm.user_id = v_user_id\n  ) then\n    raise exception 'Business access denied';");
    expect(migration).toContain('p_idempotency_key');
    expect(migration).toContain('p_business_id');
  });
});
