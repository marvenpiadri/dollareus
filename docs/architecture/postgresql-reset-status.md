# PostgreSQL reset — implementation status

Last reviewed: 2026-10-11

## Product decision

Dollareus is being treated as a new application. PostgreSQL is the source of truth for all business/application records. There is no Firestore data migration and no versioned SQL migration history. Dollareus owns authentication: password credentials, sessions, OAuth account links, and token records are stored in PostgreSQL. Firebase is not part of the architecture.

## Phase 1 — database foundation

Status: in progress.

- [x] Add a clean schema at `apps/api/db/schema.sql`.
- [x] Remove SQL `DEFAULT` clauses; the API must supply values explicitly.
- [x] Add a one-time setup command, `pnpm db:setup`, that refuses to run if the public schema already contains tables.
- [x] Require `DATABASE_URL` when the API imports the PostgreSQL pool.
- [x] Remove the old versioned migration runner and its two SQL migration files.
- [x] Remove Firestore imports and Firestore configuration/rules/indexes.
- [x] Remove Firebase Auth verification and the Firebase Admin SDK.
- [x] Add first-party email/password registration, login, logout, and session endpoints.
- [x] Add Google and Facebook OAuth authorization-code flows with state validation and Google PKCE.
- [x] Add PostgreSQL tables for users, password credentials, sessions, OAuth accounts/state, and email-token purposes.
- [x] Add email verification and password recovery API flows using a Resend-compatible email API.
- [x] Add merchant sign-in/register, social login, email verification, and password recovery screens.
- [x] Bind OAuth state to a short-lived HttpOnly cookie to mitigate login CSRF.
- [ ] Execute the fresh schema against the intended empty Neon database.
- [ ] Run `pnpm ci` after the authentication changes; GitHub could not be cloned in this environment, so compile/test status is not confirmed.
- [ ] Configure and test Google/Facebook OAuth, email delivery, production API URL, and secure cookie behavior.
- [ ] Verify the created tables directly in Neon.

## Phase 2 — PostgreSQL API

Status: core commerce API expansion implemented; live database integration and CI verification still pending.

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
- restaurant menu and menu-item create/list APIs plus a public published-menu projection;
- managed QR/direct-link entry-point create/list/disable APIs and published-entry-point lookup;
- order-scoped fulfillment create/list/update APIs with carrier, tracking number/URL, expected delivery, notes, validated delivery-stage transitions, and audit events.

The schema also defines categories, media metadata, inventory, customers, carts, orders, payments, fulfillments, restaurant menus, POS, entry points, domains, and audit events. Not all of those tables have their API routes reimplemented yet. The former Firestore route implementations were removed rather than retained as fallback paths.

## Phase 3 — complete the application

In progress. The public homepage and browser-side QR Studio are available without an account; merchant routes remain session-gated. Email-provider configuration is optional for signup and sign-in, while verification and password-recovery email delivery require a configured provider. Remaining work:
- reimplement POS, domain and media routes against PostgreSQL;
- finish restaurant menu editing, publishing and modifier workflows;
- [x] add audited manual shipping/fulfillment tracking APIs and merchant UI for carrier, tracking number/URL, expected delivery, notes, and delivery stages; delivery progress is kept separate from payment collection.
- [ ] verify the shipping UI/API in CI and against the intended Neon schema; COD collection is recorded through the existing manual/offline payment workflow.
- [ ] add refund records and controls (online payment gateway processing remains intentionally deferred);
- improve merchant workspace readability and align its palette with X-Facture's midnight/navy and money-green design tokens (implemented; build verification pending);
- finish the remaining merchant workspace screens and operational actions;
- extend tenant-isolation, transaction, validation, and API integration tests;
- run and resolve CI on the new implementation before live database/provider testing;
- continue Angular merchant-dashboard integration and verify the new offline-payment UI in a real build;
- add a scoped developer API product: per-client credentials, organization-bound permissions, usage metering, webhooks, API documentation, and paid plans;
- add shared Dollareus/Mageus identity using a proper cross-domain OAuth/OIDC flow and stable user IDs; do not duplicate password stores or assume cookies work across unrelated domains;
- Mageus is the default public storefront and discovery layer. Dollareus remains the business engine and API provider; add Mageus integration authorization and customer-facing storefront/ordering/booking flows there, not as a competing Dollareus storefront;


## Operational note

The schema setup is intentionally not automatic on API startup. It is a one-time, explicit operation against an empty database. It does not drop existing objects or migrate old records. The live Neon schema has not yet been verified from this development session.

## Product architecture decision — 2026-10-11

Dollareus is the operational engine and API provider, not a public storefront product. The merchant workspace is one client of the same APIs that Mageus and authorized third-party applications will consume. A business should be able to manage menus, products, prices, stock, orders, reservations, and fulfillment in Dollareus while its Mageus page or custom branded website reflects those changes through the API.

Mageus owns public storefronts, publishing, magazines, communities, discovery, and the customer-facing purchase/booking experience by default. Customers should be able to check out as guests; optional customer accounts can use the shared identity. The shared-account implementation must use a proper identity protocol for cross-domain SSO, preserve app-specific authorization, and never allow one organization or API client to access another organization's records.

Long-term delivery integrations (including third-party food delivery services) should be added as adapters on top of the core order/fulfillment APIs. A marketplace is not part of the current launch scope.

## Verification note

GitHub Actions passes on commit `5587b6d15fcf87181f0918a7dbb5cc14d5f63b77`: Angular production build, API TypeScript check, and the PostgreSQL-backed HTTP smoke suite all succeeded. The CI suite uses a disposable PostgreSQL service and does not verify the user's live Neon database. The live Neon schema/setup and browser-level visual/responsive checks remain pending. The merchant UI readability pass is committed; inspect it in a browser before considering the visual QA checklist complete.
