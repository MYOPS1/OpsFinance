import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/011_idempotency_rpc_access_hardening.sql'), 'utf8');

describe('idempotency RPC tenant isolation migration', () => {
  it('requires authentication and same-business membership', () => {
    expect(sql).toContain('auth.uid() is null');
    expect(sql).toContain('bm.business_id = p_business_id');
    expect(sql).toContain('bm.user_id = auth.uid()');
    expect(sql).toContain("raise exception 'Business access denied'");
  });
  it('grants execution only to authenticated role', () => {
    expect(sql).toContain('from public;');
    expect(sql).toContain('from anon;');
    expect(sql).toContain('to authenticated;');
  });
});
