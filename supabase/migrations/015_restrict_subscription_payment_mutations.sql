-- Payment rows are created by the authenticated checkout route and finalized by
-- the service-role webhook handler. Members must not rewrite or delete payment history.

revoke update, delete on table public.subscription_payments
from public, anon, authenticated;
