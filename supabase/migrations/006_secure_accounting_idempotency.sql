-- Restrict idempotency storage to the atomic posting SECURITY DEFINER function.
-- Concurrent duplicate-post handling remains a separate follow-up requiring
-- dedicated tests and review; this migration intentionally does not change it.

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
