-- Restrict SECURITY DEFINER lookup to members of the requested business.
create or replace function public.get_accounting_idempotency(
  p_business_id uuid,
  p_idempotency_key text,
  p_operation_type text default 'ACCOUNTING_POST'
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_business_id is null then
    raise exception 'Business access denied';
  end if;
  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
  ) then
    raise exception 'Business access denied';
  end if;
  return (
    select ik.result_id
    from public.idempotency_keys ik
    where ik.business_id = p_business_id
      and ik.idempotency_key = p_idempotency_key
      and ik.operation_type = p_operation_type
    limit 1
  );
end;
$$;
revoke all on function public.get_accounting_idempotency(uuid, text, text) from public;
revoke all on function public.get_accounting_idempotency(uuid, text, text) from anon;
revoke all on function public.get_accounting_idempotency(uuid, text, text) from authenticated;
grant execute on function public.get_accounting_idempotency(uuid, text, text) to authenticated;
