# Subscription Billing

## Overview

OpsFinance uses a platform-billing layer separate from customer accounting records. Subscription charges live in the billing domain and do not post to customer journals, ledger entries, trial balances, balance sheet accounts, or cash flow reports.

## Starter plan

- Plan: Starter
- Price: RM29/month
- Max businesses: 1
- Max active users on a business: 1
- Included features: dashboard, transactions, accounts, upload_and_convert, reconciliation, reports, settings, accounting_rules
- Excluded future-plan features: multi_business, advanced_ai, payroll, inventory, advanced_tax, advanced_approval, multi_user

## Lifecycle

The implementation uses the canonical lifecycle states defined in the service:

- ACTIVE
- PAST_DUE
- GRACE_PERIOD
- SUSPENDED
- CANCELLED

Valid transitions:

- ACTIVE -> PAST_DUE
- ACTIVE -> CANCELLED
- PAST_DUE -> ACTIVE
- PAST_DUE -> GRACE_PERIOD
- GRACE_PERIOD -> ACTIVE
- GRACE_PERIOD -> SUSPENDED
- SUSPENDED -> ACTIVE
- CANCELLED -> no valid transition in the service contract

## Payment states

Payment records follow the service payment status model:

- INITIATED
- PENDING
- AUTHORIZED
- PAID
- FAILED
- CANCELLED
- REFUNDED

The current implementation supports initiation, status updates, and history tracking for the billing workflow. Payment history retains invoice references, billing periods, amounts, currency, status, payment dates, and failure reasons when present.

## Renewal and failure flow

- A successful renewal requires a paid payment record for the current cycle.
- An unpaid or failed renewal transitions the subscription to PAST_DUE and records the renewal failure in audit history.
- Grace period handling follows the configured grace window before suspension.
- Suspension and reactivation are deterministic and driven by service lifecycle transitions.

## Grace period, suspension, and reactivation

- Grace starts when a subscription enters GRACE_PERIOD.
- Suspension occurs only after allowed service transitions.
- Reactivation is allowed from PAST_DUE, GRACE_PERIOD, or SUSPENDED status.
- Cancelled subscriptions are terminal in the current service model.

## Billing and payment history

The service records payment history per subscription and preserves all billing events in the subscription audit trail. History includes:

- payment/reference ID
- billing period
- amount
- currency
- status
- payment date
- failure reason if present

## Idempotency and duplicate protection

The service enforces idempotent behavior for:

- payment records keyed by provider event id
- duplicate callback prevention
- repeated subscription/payment lookups by authoritative service state

Duplicate provider callbacks do not create duplicate payment records in the service contract.

## Feature entitlements

OpsFinance is a standalone accounting application. Subscription billing remains in the codebase only as a compatibility layer and is intentionally disconnected from accounting authorization. Accounting features are not gated by subscription status, payment state, or trial expiry checks.

The service rejects unsupported features for Starter only in the legacy billing model; standalone accounting access is evaluated through Supabase auth, business membership, tenant isolation, and RLS instead.

## Server-side enforcement and business isolation

The UI is not the security boundary. Subscription state, plan rules, membership limits, and payment access are enforced using the service's authoritative state.

The implementation rejects client-supplied overrides for:

- business_id
- plan
- price
- subscription status

Business A cannot access Business B subscription or billing data. User A cannot access another business's subscription data.

## Audit trail

The service emits real lifecycle and billing audit events, including:

- subscription_created
- subscription_activated
- payment_initiated
- payment_succeeded
- payment_failed
- subscription_past_due
- grace_period_started
- subscription_suspended
- subscription_reactivated
- subscription_cancelled
- renewal_succeeded
- renewal_failed

These events are created by service operations and are not manually injected by tests.

## Platform finance separation and accounting boundary

Subscription billing is platform finance, not customer accounting.

The service does not create:

- customer P&L entry
- customer Balance Sheet entry
- customer Trial Balance entry
- customer General Ledger entry
- customer Cash Flow entry

Subscription and payment records remain platform billing data, separate from business accounting data.

## Database / RLS status

The repository contains the existing Phase 1 foundation and RLS policies for business isolation. There is no live Supabase database verification in this environment.

- LIVE SUPABASE UAT = BLOCKED / NOT AVAILABLE

## Live payment provider status

- LIVE PAYMENT PROVIDER = NOT CONFIGURED

The abstraction is intentionally usable for future integration, but no fake or real production credentials are added.

## Browser E2E status

This repository does not configure browser E2E automation.

- E2E = NOT CONFIGURED / N/A

## Implementation note

This document matches the current service implementation and the verified test suite. Any future provider integration must be introduced behind the same provider abstraction and must not bypass the accounting boundary.
