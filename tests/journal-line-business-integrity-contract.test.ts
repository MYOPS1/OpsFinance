import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/012_journal_line_business_integrity.sql'), 'utf8');

describe('journal line tenant integrity contract', () => {
  it('validates chart account ownership against journal business', () => {
    expect(sql).toContain('je.business_id into v_business_id');
    expect(sql).toContain('a.business_id = v_business_id');
  });
  it('validates financial account ownership against journal business', () => {
    expect(sql).toContain('fa.business_id = v_business_id');
    expect(sql).toContain('new.financial_account_id is not null');
  });
  it('protects inserts and updates via a database trigger', () => {
    expect(sql).toContain('before insert or update of journal_entry_id, account_id, financial_account_id');
    expect(sql).toContain('for each row execute function');
  });
});
