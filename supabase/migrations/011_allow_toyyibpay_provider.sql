-- Allow the provider values currently used by the application while preserving legacy CURLEC rows.
-- This is a forward-only schema fix for a live database that already has migration 010 applied.

alter table public.subscription_payments
  drop constraint if exists subscription_payments_provider_check;

alter table public.subscription_payments
  add constraint subscription_payments_provider_check
  check (provider in ('CURLEC', 'TOYYIBPAY')) not valid;
