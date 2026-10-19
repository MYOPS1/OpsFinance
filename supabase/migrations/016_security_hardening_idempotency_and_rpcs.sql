-- Harden idempotency storage by removing direct API access and preserving only the
-- authenticated accounting POST workflow that is validated inside the SECURITY DEFINER function.
-- Service-role access remains available for operational tooling and webhooks.

revoke all on table public.idempotency_keys
from public, anon, authenticated;

revoke execute on function public.get_accounting_idempotency(uuid, text, text)
from public, anon, authenticated;

revoke execute on function public.post_accounting_transaction_atomic(
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
)
from public, anon;

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
)
to authenticated;

-- No service-role grants are added here. The SECURITY DEFINER owner executes with
-- the privileged Postgres role and the app path is intentionally limited to the
-- authenticated atomic posting RPC. If a separate direct-access dependency is
-- proven later, it should be added with the smallest explicit grant necessary.

-- RLS is enabled only after validating the SECURITY DEFINER ownership model.
-- The definer function remains the only sanctioned writer for this table and the
-- regular API roles are blocked even if privileges are later widened.
alter table public.idempotency_keys enable row level security;

drop policy if exists "idempotency_keys_no_direct_access" on public.idempotency_keys;

create policy "idempotency_keys_no_direct_access"
on public.idempotency_keys
for all
to public, anon, authenticated
using (false)
with check (false);
