-- Reject cross-business account references even when a caller bypasses application validation.
create or replace function public.validate_journal_line_business_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  select je.business_id into v_business_id
  from public.journal_entries je
  where je.id = new.journal_entry_id;

  if v_business_id is null then
    raise exception 'Journal entry not found.';
  end if;

  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.business_id = v_business_id
  ) then
    raise exception 'Journal account does not belong to this business.';
  end if;

  if new.financial_account_id is not null and not exists (
    select 1 from public.financial_accounts fa
    where fa.id = new.financial_account_id and fa.business_id = v_business_id
  ) then
    raise exception 'Journal financial account does not belong to this business.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_journal_line_business_scope_trigger on public.journal_lines;
create trigger validate_journal_line_business_scope_trigger
before insert or update of journal_entry_id, account_id, financial_account_id
on public.journal_lines
for each row execute function public.validate_journal_line_business_scope();
