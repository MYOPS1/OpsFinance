# OpsFinance production readiness audit

## Status summary

This repository now passes the locally executable validation suite in this environment:

- `npm test` — 213 tests passed
- `npm run typecheck` — passed
- `npm run lint` — passed with 5 non-blocking navigation warnings in login/register pages
- `npm run build` — passed
- `npm run test:e2e` — 16 passed

The critical hydration issue in the subscription workflow was fixed by making the subscription service clock injectable and stable for SSR, plus a regression test covering the SSR billing-period snapshot.

## Completed modules and status

- Dashboard: real DB-backed rendering path validated in app and end-to-end workflows
- Business profile: CRUD and business-context loading implemented and tested
- Financial accounts and chart-of-accounts: service-layer and workflow validations pass
- Money in/out/transfer/journal: workflow tests pass
- General ledger / account statement / trial balance / P&L / BS / cash flow: report engine and tests pass
- Upload & convert: upload workflow and validation tests pass
- Reconciliation: workflow and validation tests pass
- Subscription billing UI: hydration-safe billing period regression covered

## Incomplete or externally blocked items

The following items remain external-blocked and cannot be marked production-ready without the required credentials and access:

1. ToyyibPay live API integration and callback validation
   - Missing provider credentials, sandbox/live configuration and callback secrets
   - Real payment validation cannot be safely proven without environment access

2. MYOPS secure integration contract
   - The contract must be served and validated by the MYOPS backend, not via query-string or browser-local tokens
   - This repository cannot change the MYOPS app directly and no MYOPS secrets or session tokens are available in this workspace

3. Real Supabase production tenant and RLS validation
   - The required production or UAT project credentials, RLS policy access, and live data configuration are not available here
   - No production business or payment data may be modified or tested in-place

4. real upload and financial data ingestion
   - Actual PDF/CSV/Excel invoice and receipt processing requires authenticated business data and provider permissions that are not available in this environment

## Recommended secure MYOPS integration contract

The integration must be server-to-server and server-validated, using the following pattern:

- MYOPS authenticates the user and creates a signed session token or server-issued assertion for the authenticated principal
- OpsFinance receives a validated session assertion from MYOPS via a backend exchange endpoint, not from browser query parameters or local storage
- OpsFinance verifies issuer, audience, expiry, tenant/business binding and subscription entitlement on the server before creating a session
- A request is rejected if the session is missing, expired, or not associated with a valid active subscription
- The server enforces a 15-minute inactivity timeout and invalidates sessions on expiry
- Unsubscribed users are denied application access even if a MYOPS session exists
- No application logic relies on browser-side claims as authorization

## Production-readiness checklist

- [x] Locally executable unit, type, build and E2E validations pass
- [x] SSR hydration safety issue in subscription billing fixed
- [x] Accounting/report services are using actual posted journal lines and validated calculations
- [x] Financial transaction flows have regression coverage
- [x] Subscription UI remains deterministic and hydration-safe
- [ ] Live ToyyibPay credentials and callback verification available
- [ ] MYOPS session contract implementation approved and validated by the MYOPS backend owner
- [ ] Production Supabase project credentials and RLS validation access available
- [ ] Business UAT and payment UAT completed against real tenant data
- [ ] Final production sign-off from finance, auth and platform owners

## Final recommendation

OpsFinance is ready for a controlled UAT cycle in a credentialed environment, but it is not production-ready for live deployment until the external MYOPS, Supabase and ToyyibPay configurations are available and explicitly validated.
