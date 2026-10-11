# Dollareus launch readiness

Last reviewed: 2026-10-11

## Current verdict

**Not ready for a public commerce launch.** The repository is still a foundation. Authentication routes and screens have been added, but CI, live database setup, real-provider configuration, commerce API coverage, and end-to-end behavior must be verified before accepting real merchants or orders.

## P0 — required before any public account signup

### Runtime and database
- [ ] Run `pnpm ci` successfully on the latest `main` commit.
- [ ] Create/use the intended empty Neon PostgreSQL database and run `pnpm db:setup`; verify all tables and indexes directly in Neon.
- [ ] Confirm the API deployment can connect to Neon using a server-side `DATABASE_URL`; do not expose the URL to the browser.
- [ ] Configure the merchant app's API base URL or a same-origin reverse proxy; configure `CORS_ORIGINS` to the exact production origin.
- [ ] Set production `NODE_ENV=production` so session cookies use `Secure`.
- [ ] Configure secrets in the hosting provider, not in Git.

### First-party authentication
- [ ] Configure Google OAuth client, exact production callback URL, and consent-screen settings; test sign-up, returning sign-in, denied consent, and invalid/expired state.
- [ ] Configure Meta/Facebook OAuth app, email permissions, exact callback URL, and review requirements; test with real approved test users.
- [ ] Configure email delivery (`AUTH_EMAIL_API_KEY`, `AUTH_EMAIL_FROM`, `AUTH_PUBLIC_URL`), verify sender-domain SPF/DKIM/DMARC, and test delivery to major inbox providers.
- [ ] Test register, verify, resend verification, login, logout, forgot password, reset password, expired/reused tokens, duplicate accounts, and revoked sessions.
- [ ] Confirm social account linking behavior, session cookie behavior across the deployed frontend/API origins, and account suspension.
- [ ] Add operational recovery and support procedures for locked-out accounts and email-provider outages.
- [ ] Complete an independent security review of authentication, rate limits, CSRF/origin handling, token lifecycle, and password storage before real customer accounts are accepted.

## P0 — required before accepting real commerce data

### Connect the merchant UI to real data
- [x] Replace hard-coded sample products and demo store identity with API-backed workspace/catalog state; show unavailable indicators instead of fabricated sales and inventory metrics.
- [x] Implement first-run organization/store creation and draft product creation through the API, with loading/error states.
- [ ] Finish onboarding and storefront configuration; implement product publishing, category management, additional variant management, images, and inventory changes. Basic product detail editing and archiving are now available.
- [ ] Finish merchant-facing customer records, carts, order operations, payment states, fulfillment, cancellation/refund controls, and transactional emails. API-level manual refund recording is implemented but requires fresh CI and database verification.
- [ ] Implement and test restaurant menus/menu items, POS sessions/orders, QR/entry points, custom domains, and inventory endpoints if those modules are included in the first launch.
- [ ] Implement object-storage uploads with server-side authorization, file type/size limits, and safe public/private access rules.
- [ ] Complete organization membership roles and server-side authorization for every private route.
- [ ] Ensure public storefront APIs only expose published data and never leak drafts or private merchant/customer information.

### Payments, tax, and business correctness
- [ ] Decide which country, business type, currency, and payment methods are supported for launch; do not advertise unsupported countries/modules.
- [ ] Integrate a real payment provider and verify signed webhooks, duplicate-event handling, idempotency, payment failures, actual provider refunds, and reconciliation. Current refund endpoints only record manual refunds; they do not transfer money.
- [ ] Define tax calculation/invoice behavior with appropriate local review; test totals, discounts, shipping, rounding, and currency minor units.
- [ ] Add order-number generation, stock reservation/decrement rules, and concurrent-order tests.

## P1 — reliability, compliance, and launch operations

- [ ] Add automated unit, API integration, database, and browser end-to-end tests.
- [ ] Add structured error reporting, uptime/health monitoring, alerting, and audit logs for security-sensitive actions.
- [ ] Configure database backups and verify a restore; document recovery-time and recovery-point targets.
- [ ] Add production logging/retention rules and redact passwords, tokens, cookies, OAuth codes, and personal data.
- [ ] Publish privacy policy, terms of service, data retention/deletion policy, support contact, and merchant/customer data-handling terms.
- [ ] Test accessibility, mobile layouts, localization, currency formatting, and empty/error states.
- [ ] Verify custom-domain TLS, DNS onboarding, rate limits, request size limits, and abuse controls.
- [ ] Add deployment rollback procedure, environment separation, and a smoke test after every production deploy.

## Launch strategy

1. **Internal preview:** authentication and onboarding only; no real payments or customer orders.
2. **Private pilot:** one defined country/business segment, real database, monitored merchant onboarding, manual support, and no unsupported modules advertised.
3. **Public launch:** only after the relevant P0 items are complete and tested, backup restore is proven, and production secrets/domains/providers are configured.

Track implementation details in [the PostgreSQL reset status](architecture/postgresql-reset-status.md) and milestones in [first milestones](product/first-milestones.md).
