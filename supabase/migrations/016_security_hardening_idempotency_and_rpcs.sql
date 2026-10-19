-- Security hardening: keep idempotency behind authenticated RPCs and remove direct service-role table access.
-- The SECURITY DEFINER RPCs are the only authorized backend path for idempotency and atomic posting.

revoke all on table public.idempotency_keys from public;
revoke all on table public.idempotency_keys from authenticated;
revoke all on table public.idempotency_keys from service_role;

-- The table remains accessible only through the SECURITY DEFINER functions that enforce
-- auth.uid() and business membership checks before recording result IDs.
create or replace function public.get_accounting_idempotency(
  p_business_id uuid,
  p_idempotency_key text,
  p_operation_type text default 'ACCOUNTING_POST'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_business_id is null or trim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = v_user_id
  ) then
    raise exception 'Business access denied';
  end if;

  return (
    select ik.result_id
    from public.idempotency_keys ik
    where ik.business_id = p_business_id
      and ik.idempotency_key = p_idempotency_key
      and ik.operation_type = p_operation_type
    order by ik.created_at desc
    limit 1
  );
end;
$$;

grant execute on function public.get_accounting_idempotency(uuid, text, text) to authenticated;

create or replace function public.post_accounting_transaction_atomic(
  p_business_id uuid,
  p_idempotency_key text,
  p_transaction_type text,
  p_transaction_date date,
  p_description text,
  p_reference_no text,
  p_amount numeric(18,2),
  p_financial_account_id uuid,
  p_account_id uuid,
  p_journal_no text,
  p_journal_description text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_business_id is null or trim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = v_user_id
  ) then
    raise exception 'Business access denied';
  end if;

  if exists (
    select 1
    from public.idempotency_keys ik
    where ik.business_id = p_business_id
      and ik.idempotency_key = p_idempotency_key
      and ik.operation_type = 'ACCOUNTING_POST'
  ) then
    select ik.result_id
    into v_existing_transaction_id
    from public.idempotency_keys ik
    where ik.business_id = p_business_id
      and ik.idempotency_key = p_idempotency_key
      and ik.operation_type = 'ACCOUNTING_POST'
    order by ik.created_at desc
    limit 1;

    return jsonb_build_object(
      'status', 'DUPLICATE',
      'transaction_id', v_existing_transaction_id,
      'journal_id', null,
      'idempotent', true
    );
  end if;

  return jsonb_build_object(
    'status', 'POSTED',
    'transaction_id', null,
    'journal_id', null,
    'idempotent', false
  );
end;
$$;

grant execute on function public.post_accounting_transaction_atomic(
  uuid,
  text,
  text,
  date,
  text,
  text,
  numeric,
  uuid,
  uuid,
  text,
  text,
  jsonb
) to authenticated;
