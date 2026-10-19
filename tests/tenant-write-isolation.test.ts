import { describe, expect, it, vi } from 'vitest';
import { SupabaseRepositoryAdapter, SupabaseTransactionRepository } from '../packages/supabase-persistence';

describe('tenant write boundaries', () => {
  it('rejects unscoped updates before hitting Supabase', async () => {
    const from = vi.fn();
    const repo = new SupabaseRepositoryAdapter<any>('accounts', { from });
    await expect(repo.update('record-1', { name: 'changed' })).rejects.toThrow('Business access denied');
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('blocks ownership and record id changes', async () => {
    const repo = new SupabaseRepositoryAdapter<any>('accounts', { from: vi.fn() });
    await expect(repo.update('record-1', { business_id: 'other' }, 'business-a')).rejects.toThrow('ownership');
    await expect(repo.update('record-1', { id: 'record-2' }, 'business-a')).rejects.toThrow('identity');
  });

  it('adds both id and business_id predicates for updates', async () => {
    const filters: Array<[string, string]> = [];
    const query: any = {
      eq: vi.fn((key: string, value: string) => { filters.push([key, value]); return query; }),
      select: vi.fn(async () => ({ data: [{ id: 'record-1', business_id: 'business-a', name: 'changed' }], error: null })),
    };
    const repo = new SupabaseRepositoryAdapter<any>('accounts', { from: () => ({ update: () => query }) });
    await repo.update('record-1', { name: 'changed' }, 'business-a');
    expect(filters).toEqual([['id', 'record-1'], ['business_id', 'business-a']]);
  });

  it('rejects cross-business updates when no row matches', async () => {
    const query: any = { eq: vi.fn(() => query), select: vi.fn(async () => ({ data: [], error: null })) };
    const repo = new SupabaseRepositoryAdapter<any>('accounts', { from: () => ({ update: () => query }) });
    await expect(repo.update('record-1', { name: 'changed' }, 'business-a')).rejects.toThrow('Record not found');
  });

  it('inserts transactions without upsert and verifies business ownership', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({
      data: { id: 'tx-1', business_id: 'business-a' }, error: null,
    }) }) }));
    const upsert = vi.fn();
    const repo = new SupabaseTransactionRepository({ from: () => ({ insert, upsert }) });
    await repo.create({ id: 'tx-1', businessId: 'business-a', date: '2026-10-19', type: 'MONEY_IN', amount: '10.00', description: 'test' } as any);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });
});
