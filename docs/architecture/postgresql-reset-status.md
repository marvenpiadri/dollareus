# PostgreSQL reset — implementation status

Last reviewed: 2026-10-10

## Product decision

Dollareus is being treated as a new application. PostgreSQL is the source of truth for all business/application records. There is no Firestore data migration and no versioned SQL migration history. The existing Firebase Auth token verifier is retained for identity only; it must not be used to persist application data.

## Phase 1 — database foundation

Status: in progress.

- [x] Add a clean schema at `apps/api/db/schema.sql`.
- [x] Remove SQL `DEFAULT` clauses; the API must supply values explicitly.
- [x] Add a one-time setup command, `pnpm db:setup`, that refuses to run if the public schema already contains tables.
- [x] Require `DATABASE_URL` when the API imports the PostgreSQL pool.
- [x] Remove the old versioned migration runner and its two SQL migration files.
- [x] Remove Firestore imports and Firestore configuration/rules/indexes.
- [ ] Execute the fresh schema against the intended empty Neon database.
- [ ] Verify the created tables directly in Neon.

## Phase 2 — PostgreSQL API

Status: core cutover started; endpoint parity is incomplete.

The API currently has PostgreSQL-backed endpoints for:
- health checks;
- creating and listing organizations, including the first owner membership;
- creating and listing stores and storefront settings;
- listing and creating products with variants;
- reading published store and catalog projections.

The schema also defines categories, media metadata, inventory, customers, carts, orders, payments, fulfillments, restaurant menus, POS, entry points, domains, and audit events. Not all of those tables have their API routes reimplemented yet. The former Firestore route implementations were removed rather than retained as fallback paths.

## Phase 3 — complete the application

Not started / in progress after Phase 2:
- reimplement the remaining category, menu, POS, entry-point, domain, media, inventory, customer and order routes against PostgreSQL;
- restore product editing and complete the merchant workflows;
- add tenant-isolation, transaction, validation, and API integration tests;
- connect the Angular merchant dashboard to the API;
- add Mageus integration authorization and production storefront hosting;
- run CI and resolve any failures before considering this cutover stable.

## Operational note

The schema setup is intentionally not automatic on API startup. It is a one-time, explicit operation against an empty database. It does not drop existing objects or migrate old records. The live Neon schema has not yet been verified from this development session.
