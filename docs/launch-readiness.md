# Dollareus launch readiness

Last reviewed: 2026-10-13

## Current verdict

**Not ready for a public commerce launch; core restaurant workflows pass automated CI, but staging and production operations remain unverified.** The latest verified run (commit `4b7e5f8`, [run 38456853981](https://github.com/marvenpiadri/dollareus/actions/runs/38456853981)) passed the Angular production build, SSR response check, API typecheck, fresh PostgreSQL migrations/schema checks, HTTP smoke suite, and real Chromium restaurant workflow. Public storefront navigation now consistently uses username/location URLs; legacy slug-based public routes and API endpoints were removed. Live staging database and object-storage checks are blocked because the GitHub `staging` environment lacks `STAGING_DATABASE_URL`; the S3-compatible storage secrets must also be configured. Production authentication providers, real payment processing, domain/TLS routing, backups, and broader browser coverage still require verification.

## P0 — required before any public account signup

### Runtime and database
- [x] Latest verified application-code CI passed on commit `3c7b3798fe172751b3f5ca8a5c51c19c0bde2f4e`: Angular production build, SSR HTML check, API TypeScript check, fresh PostgreSQL migration setup, and HTTP API smoke suite (49 checks). It includes reservation oversell prevention, order/POS/payment/refund idempotency conflict checks, published-catalog-only developer credentials, privileged-route denial, atomic daily quota enforcement, usage metering, revocation, and proof that draft products are excluded from the integration catalog. [Run 38196517454](https://github.com/marvenpiadri/dollareus/actions/runs/38196517454).
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
- [ ] Finish onboarding and storefront configuration. Store settings now support editing the store name, business type, lifecycle status, default currency, locale and time zone, with owner/admin/manager authorization. Paused/archived stores are hidden from public routes. Storefront publish/unpublish and default-experience controls are also available with owner/admin/manager authorization; public store, catalog, restaurant-menu, and branded QR entry-point endpoints remain gated on published stores. Product draft/active/archive status and category assignment are available; inventory location/level adjustment and POS completion deductions are implemented. Merchant-facing multi-variant editing now creates, updates, prices, assigns option pairs, and archives variants without deleting historical records. An append-only inventory movement ledger records manual stock-count adjustments and POS sale deductions, with a store-filtered movement history in the merchant inventory workspace. Order-level inventory reservations now have an API, durable records, and stock-counter updates; cancellation releases reservations and order completion consumes them transactionally. Basic product detail editing and archiving are available.
- [ ] Finish customer-facing carts/checkout, cancellation/refund edge cases, and transactional emails. Manual refund history/recording UI and the refund API are implemented and covered by CI; refunds only record an offline action and do not transfer money.
- [x] Complete the core browser acceptance path for restaurant onboarding, menu/dish creation, POS order creation, manual payment recording, printable receipt, inventory page, and published public menu. The POS session/order workflow is implemented and covered by CI. The merchant POS now builds multi-line tickets, supports distinct modifier selections for the same menu item, and displays an estimated total while the server remains authoritative for pricing. Product category assignment is now supported by both the merchant editor and organization-scoped API, with cross-store category validation. The POS checkout can sell active retail products and published/available restaurant menu items, and staff can record the remaining offline payment from the POS order row. POS orders share canonical order/payment/refund records. This records a payment after it has been collected; it does not process card transactions. Menu create/list and menu-item create/list APIs exist; the merchant menu workspace creates menus/items, publishes or unpublishes menus/items, changes item availability, manages store categories, and captures/edits allergen and dietary labels. Product/store/menu mutations, inventory/payment/fulfillment operations, and refunds have role checks with viewer-denial smoke coverage; continue the route-by-route authorization review before launch. Modifier groups/options now persist on menu items, are validated and priced server-side during POS checkout, and appear on the public menu. A basic unauthenticated restaurant menu page is available at `/{storeSlug}/menu` or `/menu` on a configured store subdomain. Online customer ordering/cart/checkout is not implemented; browser-level POS/menu UX checks remain pending. POS completion now deducts tracked physical/food variant stock transactionally at the register's inventory location and refuses to complete when tracked stock is insufficient. Order-level reservations can be created before fulfillment, released on cancellation, and consumed on completion. Explicit resellable-return restocking is implemented with quantity limits, manager authorization, audit events, and idempotency. Reservation expiry/automatic release for abandoned online checkouts and menu ingredient/BOM tracking remain pending. Refunds alone never automatically restore stock: a merchant must explicitly confirm that goods physically returned in resellable condition. The merchant menu workspace now manages store categories and captures/edits allergen and dietary labels per item. QR/entry-point APIs persist branding settings with owner/admin/manager authorization; the merchant QR Studio now passes saved destinations, colors, frame labels, brand names, and optional logo URLs into local PNG/SVG export. Production public-domain/base-URL configuration, TLS/routing, and cross-origin logo behavior still need end-to-end verification. Authenticated product media routes exist. Custom-domain registration/listing/disabling and DNS TXT verification APIs are implemented, with lifecycle smoke coverage; TLS provisioning, verified-domain activation, and end-to-end DNS/HTTPS testing remain incomplete.
- [x] Implement private product-image upload/retrieval using Neon S3-compatible storage, server-side authorization, file-signature/dimension/size checks, browser-side WebP compression, and cached responsive variants.
- [ ] Configure `AWS_S3_BUCKET` and the S3 credentials in the API deployment environment, then verify a real upload/read round-trip against the intended Neon bucket. Rotate any credentials previously shared in chat before configuring production.
- [ ] Role checks protect product mutations, store creation, inventory changes, menu-item creation, payment/fulfillment operations, and refunds. Developer API credentials are read-only until resource-specific write permissions are implemented; manager/operational actions require an interactive merchant session. A configurable per-credential daily API quota is enforced; continue the route-by-route authorization review and browser-level role testing before launch. The IP-level API rate limit remains 120 requests per minute by default and is configurable per deployment.
- [x] Add organization-scoped developer API credentials with hashed token storage, expiry, manager-only issue/list/revoke endpoints, usage events, and audit records. Credentials are read-only for now; configurable per-credential daily quotas are enforced and tested. Signed webhook delivery, resource-specific write scopes, and billing integration remain pending.
- [ ] Ensure public storefront APIs only expose published data and never leak drafts or private merchant/customer information.

### Payments, tax, and business correctness
- [ ] Decide which country, business type, currency, and payment methods are supported for launch; do not advertise unsupported countries/modules.
- [ ] Integrate a real payment provider and verify signed webhooks, duplicate-event handling, idempotency, payment failures, actual provider refunds, and reconciliation. Current refund endpoints only record manual refunds; they do not transfer money.
- [ ] Define tax calculation/invoice behavior with appropriate local review; test totals, discounts, shipping, rounding, and currency minor units.
- [x] Order-number generation, order-level stock reservation/release/consumption, physical-return restocking, and concurrent oversell prevention are implemented and covered by API smoke tests. [ ] Menu ingredient/BOM tracking and automatic reservation expiry for abandoned online checkouts remain pending; online checkout itself is not implemented.

## P1 — reliability, compliance, and launch operations

- [x] PostgreSQL-backed API integration smoke tests, migration checksum/schema-version verification, and a core real-Chromium restaurant acceptance path run in CI. [ ] Add focused unit tests and broader browser flows for multi-store switching, variants, reservations, returns, and refunds.
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


## Phase 2 and Phase 3 handoff

- **Phase 2 implementation:** core store settings, product variants, inventory movement history, POS stock deduction, durable order reservations/cancellation release/completion consumption, physical-return restocking, and store-published catalog gating are implemented. The PostgreSQL-backed smoke suite exercises the principal API lifecycle paths. Core merchant browser acceptance for the restaurant POS/menu/public-menu journey now passes in CI; broader multi-store, return, and reservation UI journeys remain open.
- **Phase 3 code hardening:** request-fingerprint idempotency for order/POS requests, conflict checks for payment/refund replay, read-only published-catalog developer credentials, route allowlisting, atomic daily credential quotas, usage metering/revocation, migration checksum checks, and the future-client integration boundary are implemented and covered by CI.
- **Still externally blocked:** verify migrations through `0016_track_partial_payments.sql` on the intended staging database, verify deployed API and object-storage credentials, and rehearse backup/restore and rollback. The manual [staging verification workflow](../.github/workflows/staging-verify.yml) currently stops because the GitHub `staging` environment has no `STAGING_DATABASE_URL`; it also requires `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET` for its storage round-trip.
- **Not part of these phases:** real payment processing, signed webhooks, public developer write scopes, online checkout, and Mageus integration. Do not mark public launch ready until the relevant gates above are verified.
## Core-commerce implementation notes — 2026-10-12

- [x] Store settings support core identity and operational lifecycle edits (name, business type, active/setup/paused/archived status, currency, locale and time zone); paused stores are excluded from public storefront endpoints.
- [x] Product editor supports multiple variants with individual title, SKU, option pairs, price, status, and safe archiving; the API upserts variant sets transactionally and preserves omitted historical variants.
- [x] Inventory quantity changes are recorded in an append-only movement ledger; POS sale completion and consumption of reserved order stock write sale movements in the same transaction as the stock deduction.
- [x] Merchant inventory view exposes recent movement history by active store. API movement listing is organization-scoped and supports store, variant, and bounded-limit filters.
- [x] Order-level reservations are durable, stock-checked, and released on cancellation or consumed on completion. Resellable physical returns restore stock with quantity bounds and idempotent movement records.
- [x] Durable order-level reservation and release semantics exist for tracked physical/food variants. Online checkout still needs an expiry/automatic-release policy before abandoned checkouts can safely hold stock.
- [x] Reservation concurrency smoke coverage now verifies that two orders cannot reserve more stock than is available and that cancellation restores the reserved counter.
- [x] Order and POS idempotency keys now store a SHA-256 request fingerprint; replaying the same request returns the original record, while reusing a key for a different payload returns HTTP 409. Existing legacy records without a fingerprint intentionally conflict on replay rather than being silently treated as equivalent.
- [ ] Apply and verify migrations through `0016_track_partial_payments.sql` in the intended staging database using the manual [Staging database verification workflow](../.github/workflows/staging-verify.yml), then verify the deployed API and object storage. Core restaurant browser acceptance now passes in CI; the broader multi-store, variant, reservation, refund, and physical-return browser flows remain pending. See the [developer catalog API contract](api/developer-catalog.md) for the safe read-only integration surface. The workflow requires `STAGING_DATABASE_URL` and the listed S3-compatible storage secrets in the GitHub `staging` environment.
- [x] Explicit return/restock endpoint requires an eligible order, store-matching target location, purchased-quantity bounds, manager authorization, audit record, and idempotency key; the merchant must explicitly confirm the returned quantity is resellable.
- [ ] Run browser-level acceptance across multi-store switching, variant editing, inventory count, POS completion, order reservation/cancellation, refund, and physical-return workflows before declaring public-launch readiness.
