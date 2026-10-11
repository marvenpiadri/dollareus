# Dollareus delivery roadmap

Last updated: 2026-10-12

This roadmap is ordered around making the database and API dependable before expanding product scope. A phase is complete only when its code and required deployment acceptance are both done; a successful CI build alone does not prove the live Neon database is configured.

## Phase 1 — Database foundation

**Status: implementation in place; live database acceptance pending.**

- PostgreSQL is the source of truth; no Firebase/Firestore dependency.
- Ordered, checksummed SQL migrations, transaction-per-migration, advisory locking, and fail-closed handling for an existing untracked schema.
- Read-only migration inspection via `pnpm db:status`; apply changes with `pnpm db:migrate`.
- Health endpoint reports whether the database and migration ledger are ready.
- Remaining: connect the intended Neon database, review its current schema, apply migrations safely, and verify the ledger and tables.

## Phase 2 — Data integrity and API contracts

**Status: in progress.**

- Enforce organization consistency in the database, not only in request handlers.
- Keep related order, payment, refund, fulfillment and line-item references inside the same organization.
- Keep API validation, tenant authorization, transaction boundaries and idempotency aligned with database constraints.
- Standardize feature data loading and avoid duplicate API requests between the workspace and feature components.
- Remaining: review the highest-risk write paths and complete the API/database contract pass against the evolving schema.

## Phase 3 — Complete the merchant application

**Status: in progress.**

- Finish merchant workflows and operational screens for products, inventory, orders, POS, menus, payments, refunds, fulfillment, QR entry points and developer credentials.
- Keep feature-specific state and mutations in their owning features.
- Resolve UX gaps and verify responsive behavior in a browser.
- Remaining: close gaps in operational workflows and ensure each screen reflects persisted API state rather than only local UI state.

## Phase 4 — Connect Mageus and authorized clients

**Status: planned / partial foundations exist.**

- Mageus remains the default public storefront, publishing and discovery experience; Dollareus remains the commerce engine and API provider.
- Connect public menu/catalog projections and customer-facing cart, checkout and booking flows through authorized APIs.
- Implement shared identity with a proper cross-domain OAuth/OIDC flow and stable user IDs.
- Expand developer-facing API documentation, webhooks and client integration boundaries.
- Remaining: implement and verify the end-to-end integration without duplicating commerce records or weakening tenant isolation.

## Phase 5 — Production launch and operational readiness

**Status: pending.**

- Configure production API URL, database credentials, object storage, OAuth providers, email delivery, CORS, cookies and domain/TLS routing.
- Apply migrations as a controlled deployment step and verify production health/readiness.
- Run a focused staging acceptance pass covering authentication, tenant isolation, catalog/menu reads, order creation, stock, payments/refunds, fulfillment and recovery behavior.
- Verify backups and restore procedures, logging, error reporting, and rollback/recovery instructions.
- Release only after live integrations are verified; keep tests targeted to concrete risks and regressions.

## What happens after Phase 5?

The project moves from implementation to operation and measured expansion: monitor errors and database performance, maintain forward-only migrations, fix issues found in real merchant usage, then prioritize API webhooks/quotas/billing, additional fulfillment adapters, and new business modules based on actual demand. These are post-launch product milestones, not blockers to connecting the database.

## Working rules

- Build first and keep the development loop short.
- Do not add redundant tests or make broad test suites a development gate; retain existing CI and use focused checks when they protect a real risk.
- Never drop or reset a database to make migrations pass.
- Never edit a migration that has already been applied; add a new numbered migration.
- Do not claim live database acceptance until the intended Neon database has actually been inspected.
