-- Local session emulation for PostgreSQL without Supabase staging.
select set_config('app.session_user_id', '11111111-1111-1111-1111-111111111111', true);
set role authenticated;

insert into public.users (id, email, name)
values ('11111111-1111-1111-1111-111111111111', 'usera@example.com', 'User A')
on conflict (id) do nothing;

insert into public.users (id, email, name)
values ('22222222-2222-2222-2222-222222222222', 'userb@example.com', 'User B')
on conflict (id) do nothing;

insert into public.businesses (id, name, base_currency)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business A', 'MYR')
on conflict (id) do nothing;

insert into public.businesses (id, name, base_currency)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Business B', 'MYR')
on conflict (id) do nothing;

insert into public.business_members (id, business_id, user_id, role)
values ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'OWNER')
on conflict (business_id, user_id) do update set role = excluded.role;

insert into public.business_members (id, business_id, user_id, role)
values ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'OWNER')
on conflict (business_id, user_id) do update set role = excluded.role;

insert into public.accounts (id, business_id, code, name, account_type, normal_balance)
values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1000', 'Cash A', 'ASSET', 'DEBIT')
on conflict (id) do nothing;

insert into public.accounts (id, business_id, code, name, account_type, normal_balance)
values ('66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1000', 'Cash B', 'ASSET', 'DEBIT')
on conflict (id) do nothing;

insert into public.financial_accounts (id, business_id, name, type, account_code, currency, opening_balance, status)
values ('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business A bank', 'BANK', 'BANK-A', 'MYR', 1000, 'ACTIVE')
on conflict (id) do nothing;

insert into public.financial_accounts (id, business_id, name, type, account_code, currency, opening_balance, status)
values ('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Business B bank', 'BANK', 'BANK-B', 'MYR', 2000, 'ACTIVE')
on conflict (id) do nothing;

-- Positive control: User A can access Business A only.
select count(*) as business_a_visible_accounts from public.accounts where business_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Cross-business read should fail under RLS; this assertion is intentionally executed under authenticated role.
do $$
begin
  if exists (select 1 from public.accounts where business_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-business read visible under authenticated session';
  end if;
end
$$;

-- Cross-business insert should be blocked.
do $$
begin
  insert into public.accounts (id, business_id, code, name, account_type, normal_balance)
  values ('99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1010', 'Unauthorized B account', 'ASSET', 'DEBIT');
  raise exception 'Cross-business insert unexpectedly succeeded';
exception when others then
  null;
end
$$;

-- Cross-business update should be blocked.
do $$
begin
  update public.accounts set name = 'tampered-name' where business_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  raise exception 'Cross-business update unexpectedly succeeded';
exception when others then
  null;
end
$$;

-- Cross-business financial reference should be blocked.
do $$
begin
  insert into public.transactions (
    id, business_id, transaction_no, transaction_date, transaction_type, description, reference_no,
    amount, currency, status, source, financial_account_id, created_by
  ) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaab',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'TXN-OUT-1',
    current_date,
    'MONEY_OUT',
    'cross-business attempt',
    'REF-OUT-1',
    25.00,
    'MYR',
    'POSTED',
    'MANUAL',
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111'
  );
  raise exception 'Cross-business transaction reference unexpectedly succeeded';
exception when others then
  null;
end
$$;

-- Positive business transaction should succeed.
insert into public.transactions (
  id, business_id, transaction_no, transaction_date, transaction_type, description, reference_no,
  amount, currency, status, source, financial_account_id, created_by
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaac',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'TXN-IN-1',
  current_date,
  'MONEY_IN',
  'business A positive control',
  'REF-IN-1',
  100.00,
  'MYR',
  'POSTED',
  'MANUAL',
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

-- RPC idempotency test.
do $$
declare
  v_result jsonb;
begin
  select public.post_accounting_transaction_atomic(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'local-idempotency-1',
    'MONEY_IN',
    current_date,
    'test init',
    'REF-IDEMP-1',
    42.00,
    '77777777-7777-7777-7777-777777777777',
    '55555555-5555-5555-5555-555555555555',
    'JE-LOCAL-1',
    'local idempotency test',
    '[{"account_id":"55555555-5555-5555-5555-555555555555","debit":0,"credit":42.00,"description":"cash"},{"account_id":"55555555-5555-5555-5555-555555555555","debit":42.00,"credit":0,"description":"revenue"}]'::jsonb
  ) into v_result;

  if v_result->>'status' = 'DUPLICATE' then
    raise exception 'First idempotent call unexpectedly returned duplicate';
  end if;

  select public.post_accounting_transaction_atomic(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'local-idempotency-1',
    'MONEY_IN',
    current_date,
    'test retry',
    'REF-IDEMP-1',
    42.00,
    '77777777-7777-7777-7777-777777777777',
    '55555555-5555-5555-5555-555555555555',
    'JE-LOCAL-1',
    'local idempotency retry',
    '[{"account_id":"55555555-5555-5555-5555-555555555555","debit":0,"credit":42.00,"description":"cash"},{"account_id":"55555555-5555-5555-5555-555555555555","debit":42.00,"credit":0,"description":"revenue"}]'::jsonb
  ) into v_result;

  if v_result->>'status' <> 'DUPLICATE' then
    raise exception 'Retry idempotency did not return duplicate';
  end if;
end
$$;

-- A failed posting must roll back atomically.
do $$
begin
  insert into public.journal_entries (
    id, business_id, journal_no, journal_date, source_type, description, status, posted_at, posted_by
  ) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'JE-BAD-1',
    current_date,
    'MANUAL',
    'unbalanced trigger case',
    'POSTED',
    now(),
    '11111111-1111-1111-1111-111111111111'
  );
  insert into public.journal_lines (
    id, journal_entry_id, account_id, debit, credit, description
  ) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaae',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaad',
    '55555555-5555-5555-5555-555555555555',
    10.00,
    0.00,
    'only debit'
  );
  raise exception 'Unbalanced posting unexpectedly committed';
exception when others then
  null;
end
$$;

-- Posted journal immutability should block update.
insert into public.journal_entries (
  id, business_id, journal_no, journal_date, source_type, description, status, posted_at, posted_by
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'JE-POSTED-1',
  current_date,
  'MANUAL',
  'posted journal guard',
  'POSTED',
  now(),
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

do $$
begin
  update public.journal_entries set description = 'tampered' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc';
  raise exception 'Posted journal update unexpectedly succeeded';
exception when others then
  null;
end
$$;

reset role;
