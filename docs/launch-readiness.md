# Dollareus launch readiness

Last reviewed: 2026-10-11

## Current verdict

**Not ready for a public commerce launch; suitable for controlled staging once environment setup is verified.** The repository now has a substantial API-backed merchant foundation and passing automated build/API smoke coverage. Live Neon connectivity, production credentials, OAuth/email providers, real payment processing, inventory correctness, domain routing, and browser-level end-to-end workflows still need explicit verification.

## P0 — required before any public account signup

### Runtime and database
- [x] Latest GitHub Actions production build, API type-check, and PostgreSQL-backed HTTP API smoke suite passed on code commit `dacac5a0f6c82081bf41034c6f1059d3974616dd`, including tenant/role checks, menu editing, editable dish fields, public menu experience gating, product catalog experience gating, restaurant POS tickets with modifiers, tracked stock checks, and payment/refund rules. [Run 38170647095](https://github.com/marvenpiadri/dollareus/actions/runs/38170647095).
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
- [ ] Finish onboarding and storefront configuration. Storefront publish/unpublish and default-experience controls are now available with owner/admin/manager authorization; public store, catalog, restaurant-menu, and branded QR entry-point endpoints remain gated on published stores. Product draft/active/archive status and category assignment are available; inventory location/level adjustment and POS completion deductions are implemented. Full variant management, stock movement reporting, and reservation workflows remain pending. Basic product detail editing and archiving are available.
- [ ] Finish customer-facing carts/checkout, cancellation/refund edge cases, and transactional emails. Manual refund history/recording UI and the refund API are implemented and covered by CI; refunds only record an offline action and do not transfer money.
- [ ] Complete restaurant POS menu-item workflows, POS payment recording, and inventory reservation/deduction. The POS session/order workflow is implemented and covered by CI. The merchant POS now builds multi-line tickets, supports distinct modifier selections for the same menu item, and displays an estimated total while the server remains authoritative for pricing. Product category assignment is now supported by both the merchant editor and organization-scoped API, with cross-store category validation. The POS checkout can sell active retail products and published/available restaurant menu items, and staff can record the remaining offline payment from the POS order row. POS orders share canonical order/payment/refund records. This records a payment after it has been collected; it does not process card transactions. Menu create/list and menu-item create/list APIs exist; the merchant menu workspace creates menus/items, publishes or unpublishes menus/items, changes item availability, manages store categories, and captures/edits allergen and dietary labels. Product/store/menu mutations, inventory/payment/fulfillment operations, and refunds have role checks with viewer-denial smoke coverage; continue the route-by-route authorization review before launch. Modifier groups/options now persist on menu items, are validated and priced server-side during POS checkout, and appear on the public menu. A basic unauthenticated restaurant menu page is available at `/{storeSlug}/menu` or `/menu` on a configured store subdomain. Online customer ordering/cart/checkout is not implemented; browser-level POS/menu UX checks remain pending. POS completion now deducts tracked physical/food variant stock transactionally at the register's inventory location and refuses to complete when tracked stock is insufficient. Reservation before completion, menu ingredient/BOM tracking, a dedicated stock-movement ledger, and cancellation/refund stock restoration remain pending. The merchant menu workspace now manages store categories and captures/edits allergen and dietary labels per item. QR/entry-point APIs persist branding settings with owner/admin/manager authorization; the merchant QR Studio now passes saved destinations, colors, frame labels, brand names, and optional logo URLs into local PNG/SVG export. Production public-domain/base-URL configuration, TLS/routing, and cross-origin logo behavior still need end-to-end verification. Authenticated product media routes exist. Custom-domain registration/listing/disabling and DNS TXT verification APIs are implemented, with lifecycle smoke coverage; TLS provisioning, verified-domain activation, and end-to-end DNS/HTTPS testing remain incomplete.
- [x] Implement private product-image upload/retrieval using Neon S3-compatible storage, server-side authorization, file-signature/dimension/size checks, browser-side WebP compression, and cached responsive variants.
- [ ] Configure `AWS_S3_BUCKET` and the S3 credentials in the API deployment environment, then verify a real upload/read round-trip against the intended Neon bucket. Rotate any credentials previously shared in chat before configuring production.
- [ ] Role checks now protect product mutations, store creation, inventory changes, menu-item creation, payment/fulfillment operations, and refunds; continue the route-by-route authorization review and browser-level role testing before launch. The API rate limit remains 120 requests per minute by default and is configurable per deployment.
- [x] Add organization-scoped developer API credentials with hashed token storage, read/write scope checks, expiry, manager-only issue/list/revoke endpoints, usage events, and audit records; [ ] add quota enforcement, webhook delivery, and billing integration.
- [ ] Ensure public storefront APIs only expose published data and never leak drafts or private merchant/customer information.

### Payments, tax, and business correctness
- [ ] Decide which country, business type, currency, and payment methods are supported for launch; do not advertise unsupported countries/modules.
- [ ] Integrate a real payment provider and verify signed webhooks, duplicate-event handling, idempotency, payment failures, actual provider refunds, and reconciliation. Current refund endpoints only record manual refunds; they do not transfer money.
- [ ] Define tax calculation/invoice behavior with appropriate local review; test totals, discounts, shipping, rounding, and currency minor units.
- [ ] Add order-number generation is implemented; stock is deducted on POS completion for tracked physical/food variants. Stock reservation before completion, menu ingredient/BOM tracking, cancellation stock restoration, and broader concurrent-order tests remain pending.

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


## Interpreting Neon activity

Neon console activity/spikes are a useful indication that queries or connections are reaching the database, but they do not establish that all API routes, transactions, permissions, or user workflows are correct. Use the CI smoke suite, API health checks, server logs, and a controlled end-to-end staging run as separate evidence. Do not mark live production database or object-storage verification complete based on dashboard activity alone.
