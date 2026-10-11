# PostgreSQL reset — implementation status

Last reviewed: 2026-10-11

## Product decision

Dollareus is being treated as a new application. PostgreSQL is the source of truth for all business/application records. There is no Firestore data migration. Versioned SQL migrations now live in `apps/api/db/migrations/`, with checksummed history in `public.schema_migrations`. Dollareus owns authentication: password credentials, sessions, OAuth account links, and token records are stored in PostgreSQL. Firebase is not part of the architecture.

## Phase 1 — database foundation

Status: in progress.

- [x] Add a clean schema at `apps/api/db/schema.sql`.
- [x] Remove SQL `DEFAULT` clauses; the API must supply values explicitly.
- [x] Add a checksummed SQL migration runner (`pnpm db:migrate`) with transaction-per-migration, PostgreSQL advisory locking, applied-version tracking, and fail-closed handling for untracked non-empty schemas.
- [x] Keep `pnpm db:setup` as a backwards-compatible alias to the migration runner.
- [x] Require `DATABASE_URL` when the API imports the PostgreSQL pool.
- [x] Replace the removed legacy migration runner with a clean, ordered initial schema migration.
- [x] Remove Firestore imports and Firestore configuration/rules/indexes.
- [x] Remove Firebase Auth verification and the Firebase Admin SDK.
- [x] Add first-party email/password registration, login, logout, and session endpoints.
- [x] Add Google and Facebook OAuth authorization-code flows with state validation and Google PKCE.
- [x] Add PostgreSQL tables for users, password credentials, sessions, OAuth accounts/state, and email-token purposes.
- [x] Add email verification and password recovery API flows using a Resend-compatible email API.
- [x] Add merchant sign-in/register, social login, email verification, and password recovery screens.
- [x] Bind OAuth state to a short-lived HttpOnly cookie to mitigate login CSRF.
- [ ] Execute the initial migration against the intended empty Neon database and verify the migration ledger.
- [x] GitHub Actions production build, API typecheck, and PostgreSQL-backed HTTP smoke suite pass on code commit `36957f7dd9dcdc58ec6ae17976eede22ced4244e`. [Run 38168016807](https://github.com/marvenpiadri/dollareus/actions/runs/38168016807).
- [ ] Configure and test Google/Facebook OAuth, email delivery, production API URL, and secure cookie behavior.
- [ ] Verify the created tables and `schema_migrations` ledger directly in Neon.

## Phase 2 — PostgreSQL API

Status: core commerce API expansion implemented and CI-verified; live Neon integration and production configuration remain pending.

The API currently has PostgreSQL-backed endpoints for:
- health checks;
- creating and listing organizations, including the first owner membership;
- creating and listing stores and storefront settings;
- listing and creating products with variants;
- reading published store and catalog projections;
- store-scoped category listing and creation;
- organization-scoped customer listing and creation;
- inventory location creation, stock-level reads and guarded stock adjustments;
- order listing and transactional, server-priced order creation with immutable line snapshots, idempotency-key support and audited status transitions;
- manual/offline payment recording and history per order, including cash, cash on delivery, bank transfer, mobile money, card-terminal, and other methods; pending records can be manually confirmed or cancelled, balances are calculated from confirmed receipts, and changes are audit-logged. No online payment gateway or card processing is implemented;
- restaurant menu and menu-item APIs, validated modifier groups/options with server-side POS price calculation, and public published-menu projection;
- managed QR/direct-link entry-point create/list/disable APIs and published-entry-point lookup;
- order-scoped fulfillment create/list/update APIs with carrier, tracking number/URL, expected delivery, notes, validated delivery-stage transitions, and audit events;
- order-scoped refund history and refund-recording APIs for successful offline/manual payments, with transaction locks, per-payment refundable-balance checks, idempotency keys, audit events, and derived partial/full refund status. This records a refund operationally; it does not initiate a bank, card, or payment-provider transfer.

The schema also defines categories, media metadata, inventory, customers, carts, orders, payments, fulfillments, restaurant menus, POS, entry points, domains, and audit events. Not all of those tables have their API routes reimplemented yet. The former Firestore route implementations were removed rather than retained as fallback paths.

## Phase 3 — complete the application

In progress. The public homepage, browser-side QR Studio, and a minimal published restaurant-menu renderer (`/{storeSlug}/menu`, or `/menu` on a configured store subdomain) are available without a merchant session; merchant workspace routes remain session-gated. The menu page is for browsing only; online customer carts and checkout are not implemented. Email-provider configuration is optional for signup and sign-in, while verification and password-recovery email delivery require a configured provider. Remaining work:
- [x] reimplement PostgreSQL-backed POS session/order APIs and build the merchant POS workspace for opening/closing registers, multi-line tickets, retail products, restaurant menu items, priced modifier selections, and audited status transitions. POS orders are mirrored into canonical orders/order_items. The POS screen can record the remaining offline payment. Tracked physical/food stock is deducted transactionally when an order completes, insufficient stock is rejected, and paid orders require a full recorded refund before cancellation. Stock reservation before completion, restaurant ingredient/BOM inventory, dedicated stock-movement history, cancellation/refund stock restoration, and browser-level POS tests remain pending.
- [x] add authenticated product media upload/retrieval routes backed by Neon S3-compatible object storage; browser-side WebP resizing/compression, 2400×2400 server dimension ceiling, 4 MiB optimized-upload limit, and metadata persistence are implemented. Configure `AWS_S3_BUCKET` on the API host and complete real-bucket round-trip verification.
- [x] add the first developer API access layer: bearer credentials are organization-scoped, their token is only returned once, stored as a SHA-256 hash, scope-checked, revocable, and usage-metered. The merchant workspace can create, list, revoke, and inspect usage totals for credentials. This is an API foundation, not yet a complete developer portal.
- reimplement domain routes against PostgreSQL;
- [x] expand restaurant menu management with store categories, category assignment, editable allergen/dietary metadata, and validated modifier groups/options; modifier prices are calculated server-side and published menu pages expose active categories, dietary/allergen details, and modifier choices. Browser-level menu UX checks remain pending;
- [x] add audited manual shipping/fulfillment tracking APIs and merchant UI for carrier, tracking number/URL, expected delivery, notes, and delivery stages; delivery progress is kept separate from payment collection.
- [x] verify the fulfillment API in CI; [ ] verify production carrier/tracking URLs and real operational usage against the intended deployment. COD collection is recorded through the manual/offline payment workflow.
- [x] add refund records and API controls for manually recorded refunds against successful payments; online payment gateway processing remains intentionally deferred.
- [x] add merchant UI for refund history and refund recording; CI covers partial/full refund rules and POS integration. [ ] verify the live Neon schema and deployed refund workflow before real commerce.
- [x] improve merchant workspace readability and align its palette with X-Facture's midnight/navy and money-green design tokens; production build verified in CI;
- finish the remaining merchant workspace screens and operational actions;
- extend tenant-isolation, transaction, validation, and API integration tests;
- [x] run and resolve CI on the current implementation; [ ] complete live database/provider testing;
- continue Angular merchant-dashboard integration and verify the new offline-payment UI in a real build;
- [x] add organization-bound developer API credentials with hashed-at-rest tokens, read/write scopes, expiry, manager-only issue/list/revoke endpoints, usage events, and audit records; billing/quotas and webhooks remain pending; developer credential management UI and initial documentation are now available;
- add shared Dollareus/Mageus identity using a proper cross-domain OAuth/OIDC flow and stable user IDs; do not duplicate password stores or assume cookies work across unrelated domains;
- Mageus is the default public storefront and discovery layer. Dollareus remains the business engine and API provider; add Mageus integration authorization and customer-facing storefront/ordering/booking flows there, not as a competing Dollareus storefront;


## Operational note

The schema setup is intentionally not automatic on API startup. It is a one-time, explicit operation against an empty database. It does not drop existing objects or migrate old records. The live Neon schema has not yet been verified from this development session.

## Product architecture decision — 2026-10-11

Dollareus is the operational engine and API provider, not a public storefront product. The merchant workspace is one client of the same APIs that Mageus and authorized third-party applications will consume. A business should be able to manage menus, products, prices, stock, orders, reservations, and fulfillment in Dollareus while its Mageus page or custom branded website reflects those changes through the API.

Mageus owns public storefronts, publishing, magazines, communities, discovery, and the customer-facing purchase/booking experience by default. Customers should be able to check out as guests; optional customer accounts can use the shared identity. The shared-account implementation must use a proper identity protocol for cross-domain SSO, preserve app-specific authorization, and never allow one organization or API client to access another organization's records.

Long-term delivery integrations (including third-party food delivery services) should be added as adapters on top of the core order/fulfillment APIs. A marketplace is not part of the current launch scope.

Restaurant menus are first-class, organization/store-scoped resources. Each restaurant's menu and menu items must have a stable public projection only when the store is published; QR/direct-link entry points should target that public menu path, not expose private merchant API responses. QR entry points now persist brand name, foreground/background/accent colors, optional HTTPS logo URL, frame style, and label, with owner/admin/manager mutation authorization. The merchant QR Studio resolves a public URL when a primary domain or storefront base is configured, and passes saved branding into local PNG/SVG generation. Public storefront URL configuration, TLS/routing verification, and cross-origin logo rendering still require production validation. Restaurant delivery is a later fulfillment adapter milestone, not part of the initial restaurant menu rollout.

## Verification note

GitHub Actions passed on commit `c09be0eb3de52d64fab64f19c7e4f4b8a9cfeda8`: Angular production build, API TypeScript check, and PostgreSQL-backed HTTP smoke tests for authentication, tenant isolation, viewer-role restrictions, commerce, manual refunds, fulfillment, POS sessions/orders, and canonical POS payment/refund integration. The CI database is disposable and does not verify the live Neon database. The CI suite uses a disposable PostgreSQL service and does not verify the user's live Neon database. The live Neon schema/setup and browser-level visual/responsive checks remain pending. The merchant UI readability pass is committed; inspect it in a browser before considering the visual QA checklist complete.
