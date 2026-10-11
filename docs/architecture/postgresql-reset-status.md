# PostgreSQL reset — implementation status

Last reviewed: 2026-10-10

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
- restaurant menu and menu-item create/list APIs plus a public published-menu projection;
- managed QR/direct-link entry-point create/list/disable APIs and published-entry-point lookup.

The schema also defines categories, media metadata, inventory, customers, carts, orders, payments, fulfillments, restaurant menus, POS, entry points, domains, and audit events. Not all of those tables have their API routes reimplemented yet. The former Firestore route implementations were removed rather than retained as fallback paths.

## Phase 3 — complete the application

In progress. The public homepage and browser-side QR Studio are available without an account; merchant routes remain session-gated. Email-provider configuration is optional for signup and sign-in, while verification and password-recovery email delivery require a configured provider. Remaining work:
- reimplement POS, domain and media routes against PostgreSQL;
- finish restaurant menu editing, publishing and modifier workflows;
- connect the merchant orders, customers and inventory screens to the new endpoints;
- finish order status/fulfillment actions and remaining merchant workflows;
- extend tenant-isolation, transaction, validation, and API integration tests;
- run and resolve CI on the new implementation before live database/provider testing;
- connect the Angular merchant dashboard to the API;
- add Mageus integration authorization and production storefront hosting;
- run CI and resolve any failures before considering this cutover stable.

## Operational note

The schema setup is intentionally not automatic on API startup. It is a one-time, explicit operation against an empty database. It does not drop existing objects or migrate old records. The live Neon schema has not yet been verified from this development session.
