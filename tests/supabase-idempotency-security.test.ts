import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SupabaseIdempotencyRepository } from '../packages/supabase-persistence';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/006_secure_accounting_idempotency.sql'),
  'utf8',
);
const accountingMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/005_accounting_atomic_persistence.sql'),
  'utf8',
);
const securityMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/016_security_hardening_idempotency_and_rpcs.sql'),
  'utf8',
);

const atomicPostingSignature = /public\.post_accounting_transaction_atomic\(\s*uuid,\s*text,\s*text,\s*date,\s*text,\s*text,\s*numeric,\s*uuid,\s*uuid,\s*text,\s*text,\s*jsonb\s*\)/i;
const hasDisposableDatabase = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

describe('accounting idempotency security migration', () => {
  it('keeps the first milestone schema aligned with the accounting contracts', () => {
    const foundation = readFileSync(
      join(process.cwd(), 'supabase/migrations/001_phase1_foundation.sql'),
      'utf8',
    );
    const rls = readFileSync(
      join(process.cwd(), 'supabase/migrations/002_phase1_5_rls.sql'),
      'utf8',
    );
    const immutability = readFileSync(
      join(process.cwd(), 'supabase/migrations/003_phase10a_supabase_foundation.sql'),
      'utf8',
    );

    expect(foundation).toMatch(/create table accounts/i);
    expect(foundation).toMatch(/create table journal_entries/i);
    expect(foundation).toMatch(/create table journal_lines/i);
    expect(foundation).toMatch(/create table audit_logs/i);
    expect(foundation).toMatch(/unique \(business_id, journal_no\)/i);

    expect(rls).toMatch(/alter table public\.journal_entries enable row level security/i);
    expect(rls).toMatch(/create policy "Journal entries are not deleted"/i);
    expect(rls).toMatch(/create policy "Journal lines are not deleted"/i);
    expect(rls).toMatch(/create policy "Audit logs cannot be updated"/i);
    expect(rls).toMatch(/create policy "Audit logs cannot be deleted"/i);

    expect(immutability).toMatch(/prevent_posted_journal_mutation/i);
    expect(immutability).toMatch(/prevent_posted_journal_line_mutation/i);
    expect(immutability).toMatch(/Posted journal entries are immutable/i);
  });

  it('revokes direct idempotency table access from every API role', () => {
    expect(migration).toMatch(
      /revoke all on table public\.idempotency_keys\s+from public,\s*anon,\s*authenticated\s*;/i,
    );
    expect(migration).not.toMatch(/grant\s+\w+\s+on table public\.idempotency_keys/i);
  });

  it('removes all API-role access to the unused idempotency lookup function', () => {
    expect(migration).toMatch(
      /revoke execute on function public\.get_accounting_idempotency\(uuid,\s*text,\s*text\)\s+from public,\s*anon,\s*authenticated\s*;/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.get_accounting_idempotency/i,
    );
  });

  it('allows authenticated callers to use atomic posting without allowing anonymous callers', () => {
    expect(migration).toMatch(
      new RegExp(
        `revoke execute on function ${atomicPostingSignature.source}\\s+from public,\\s*anon\\s*;`,
        'i',
      ),
    );
    expect(migration).toMatch(
      new RegExp(
        `grant execute on function ${atomicPostingSignature.source}\\s+to authenticated\\s*;`,
        'i',
      ),
    );
  });

  it('preserves the unique idempotency constraint and existing security controls', () => {
    expect(accountingMigration).toMatch(
      /unique\s*\(\s*business_id,\s*idempotency_key,\s*operation_type\s*\)/i,
    );

    const postingFunction =
      accountingMigration.match(
        /create or replace function public\.post_accounting_transaction_atomic\([\s\S]*?^end;\s*\$\$;/im,
      )?.[0] ?? '';

    expect(postingFunction).toMatch(/security definer/i);
    expect(postingFunction).toMatch(/set search_path = ''/i);
    expect(postingFunction).toContain('auth.uid()');
    expect(postingFunction).toContain('Business access denied');
    expect(postingFunction).toContain('business_members');
    expect(postingFunction).toContain('idempotency_keys');
  });

  it('prevents authenticated members from mutating or deleting payment history', () => {
    const paymentSecurity = readFileSync(
      join(process.cwd(), 'supabase/migrations/015_restrict_subscription_payment_mutations.sql'),
      'utf8',
    );

    expect(paymentSecurity).toMatch(
      /revoke update,\s*delete on table public\.subscription_payments\s+from public,\s*anon,\s*authenticated\s*;/i,
    );
  });

  it('static contract: duplicate handling is a pre-check, not a transaction-safe reservation', () => {
    const postingFunction =
      accountingMigration.match(
        /create or replace function public\.post_accounting_transaction_atomic\([\s\S]*?^end;\s*\$\$;/im,
      )?.[0] ?? '';

    expect(accountingMigration).toMatch(
      /unique\s*\(\s*business_id,\s*idempotency_key,\s*operation_type\s*\)/i,
    );
    expect(postingFunction).toMatch(/if exists \(\s*select 1\s*from public\.idempotency_keys/i);
    expect(postingFunction).toMatch(/return jsonb_build_object\(\s*'status',\s*'DUPLICATE'/i);
    expect(postingFunction).not.toMatch(/on conflict .*idempotency_keys/i);
    expect(postingFunction).toMatch(/insert into public\.idempotency_keys \(/i);
  });

  it('static contract: proposal migration reserves the idempotency key atomically before posting', () => {
    const proposed = readFileSync(
      join(process.cwd(), 'supabase/migrations/014_fix_atomic_accounting_idempotency.sql'),
      'utf8',
    );

    expect(proposed).toMatch(
      /create or replace function public\.post_accounting_transaction_atomic\([\s\S]*?returns jsonb/i,
    );
    expect(proposed).toMatch(/on conflict \(business_id, idempotency_key, operation_type\)\s*do nothing/i);
    expect(proposed).toMatch(/returning id into v_reserved_id/i);
    expect(proposed).toMatch(/if v_reserved_id is null then/i);
    expect(proposed).toMatch(/update public\.idempotency_keys\s*set result_id = v_transaction_id/i);
    expect(proposed).toContain('security definer');
    expect(proposed).toContain("set search_path = ''");
  });

  it('hardens direct table and RPC access in the final migration', () => {
    expect(securityMigration).toMatch(
      /revoke all on table public\.idempotency_keys\s+from public,\s*anon,\s*authenticated\s*;/i,
    );
    expect(securityMigration).toMatch(
      /revoke execute on function public\.get_accounting_idempotency\(uuid,\s*text,\s*text\)\s+from public,\s*anon,\s*authenticated\s*;/i,
    );
    expect(securityMigration).toMatch(
      new RegExp(
        String.raw`revoke execute on function ${atomicPostingSignature.source}\s+from public,\s*anon\s*;`,
        'i',
      ),
    );
    expect(securityMigration).toMatch(
      new RegExp(
        String.raw`grant execute on function ${atomicPostingSignature.source}\s+to authenticated\s*;`,
        'i',
      ),
    );
    expect(securityMigration).toMatch(/alter table public\.idempotency_keys enable row level security/i);
    expect(securityMigration).toMatch(/create policy "idempotency_keys_no_direct_access"/i);
    expect(securityMigration).not.toMatch(/grant all on table public\.idempotency_keys to service_role/i);
    expect(securityMigration).not.toMatch(/grant execute on function public\.get_accounting_idempotency\(uuid,\s*text,\s*text\)\s+to service_role/i);
    expect(securityMigration).not.toMatch(/grant execute on function public\.post_accounting_transaction_atomic\([\s\S]*?\)\s+to service_role/i);
  });

  it('keeps the atomic posting RPC signature compatible', () => {
    expect(securityMigration).toMatch(/public\.post_accounting_transaction_atomic\s*\(/i);
    expect(securityMigration).toMatch(
      /uuid\s*,\s*text\s*,\s*text\s*,\s*date\s*,\s*text\s*,\s*text\s*,\s*numeric\s*,\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*text\s*,\s*jsonb/i,
    );
  });

  it('disables direct client idempotency checks instead of hitting the revoked RPC', async () => {
    const repo = new SupabaseIdempotencyRepository({
      from: () => {
        throw new Error('table access should be disabled');
      },
      rpc: () => {
        throw new Error('revoked get_accounting_idempotency RPC should not be called');
      },
    } as any);

    await expect(repo.get('business-1', 'abc')).rejects.toThrow(
      /Direct idempotency lookup is disabled/i,
    );
    await expect(repo.reserve('business-1', 'abc', 'result-1')).rejects.toThrow(
      /Direct idempotency reservation is disabled/i,
    );
  });
});

const databaseIntegration = hasDisposableDatabase ? describe : describe.skip;
databaseIntegration('security hardening database integration', () => {
  it('anonymous RPC execution denied', async () => {
    const { Client } = await import('pg');
    const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
    const client = new Client({ connectionString });

    await client.connect();
    try {
      const result = await client.query(
        "SELECT has_function_privilege('anon', 'public.post_accounting_transaction_atomic(uuid, text, text, date, text, text, numeric, uuid, uuid, text, text, jsonb)', 'execute') AS has_execute;",
      );
      expect(result.rows[0]?.has_execute).toBe(false);
    } finally {
      await client.end();
    }
  });

  it('direct idempotency table access denied', async () => {
    const { Client } = await import('pg');
    const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
    const client = new Client({ connectionString });

    await client.connect();
    try {
      const result = await client.query(
        "SELECT has_table_privilege('anon', 'public.idempotency_keys', 'select,insert,update,delete') AS anon_access, has_table_privilege('authenticated', 'public.idempotency_keys', 'select,insert,update,delete') AS auth_access;",
      );
      expect(result.rows[0]?.anon_access).toBe(false);
      expect(result.rows[0]?.auth_access).toBe(false);
    } finally {
      await client.end();
    }
  });

  it('security migration applies cleanly in a disposable test database', async () => {
    const { Client } = await import('pg');
    const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
    const client = new Client({ connectionString });

    await client.connect();
    try {
      const migrationFiles = readdirSync(join(process.cwd(), 'supabase/migrations')).sort();
      for (const filename of migrationFiles) {
        const sql = readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8');
        await client.query(sql);
      }

      const result = await client.query(
        "SELECT relrowsecurity FROM pg_class WHERE relname = 'idempotency_keys' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');",
      );
      expect(result.rows[0]?.relrowsecurity).toBe(true);
    } finally {
      await client.end();
    }
  });
});
