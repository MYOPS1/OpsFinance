# OpsFinance database readiness audit

This document records the current production-readiness state for the accounting modules after the PR conflict review and billing removal cleanup.

## Merge recommendations

Recommended merge order:
1. PR #4 — SSR hydration and production-readiness remediation
2. PR #5 — Upload & Convert and Bank Reconciliation workflow completion
3. PR #6 — OpsFinance billing cleanup (remove local payment and subscription logic)

Why this order:
- PR #4 stabilizes the app shell and core UX without removing accounting features.
- PR #5 adds the user-facing operational workflows required by the accounting application.
- PR #6 removes obsolete billing code, but it also touches the same route and navigation files as the earlier PRs and should be applied last to minimize regression risk.

## Module persistence audit

| Module | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Dashboard | PARTIAL | UI renders from app shell; server-side data queries are not validated against a live Supabase dataset. | Local demo data is not sufficient for production evidence. |
| Business Profile | PARTIAL | `app/settings/business/page.tsx` and `lib/auth/business.ts` enforce business membership checks; no live validation against production RLS. | Requires staging Supabase validation. |
| Chart of Accounts | PARTIAL | `app/api/accounts/route.ts` uses authenticated membership checks and business-scoped SQL queries. | Needs real staging persistence and double-check on duplicate constraints. |
| Financial Accounts | PARTIAL | `app/api/financial-accounts/route.ts` validates business ownership and inserts journal records for opening balances. | Real callback and audit validation remain required. |
| Money In / Money Out / Transfers / Journal Entries | PARTIAL | Server routes and accounting engine enforce business scoping and balanced posting logic. | Must be validated with staging data and non-destructive audit checks. |
| General Ledger / Trial Balance / Profit & Loss / Balance Sheet / Cash Flow / Account Statement | PARTIAL | Report-generation logic is present and tested locally. | Report correctness still needs live Supabase-backed posted journal validation. |
| Upload & Convert | PARTIAL | `app/upload/page.tsx`, `components/upload-workflow.tsx` and `packages/upload.ts` are implemented. | Actual document import and approval needs staging storage and authorization validation. |
| Bank Reconciliation | PARTIAL | `app/reconciliation/page.tsx`, `components/reconciliation-workflow.tsx` and `packages/reconciliation.ts` are implemented. | Final reconciliation must be tied to real posted transactions and mandatory exception checks. |

## Production blocker summary

Production readiness remains blocked by the absence of a live, authorized Supabase staging environment and the requirement to validate real business isolation, uploaded document storage, and posting security against the production schema contract.

The codebase is not allowed to rely on demo mode in production. The runtime guard in `lib/runtime/demo-mode.ts` prevents that accidentally even when a development flag is misconfigured.
