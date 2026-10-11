# Dollareus delivery roadmap

Last updated: 2026-10-12

The agreed delivery order is: **finish restaurant operations → finish store management and audit the remaining commerce platform → connect Mageus → production acceptance**. Database safety and tenant integrity remain prerequisites throughout. A phase is complete only when its code and required deployment acceptance are done; a successful CI build alone does not prove the live Neon database is configured.

## Foundation — Database and tenant integrity

**Status: implementation in place; live database acceptance pending.**

- PostgreSQL is the source of truth; no Firebase/Firestore dependency.
- Ordered, checksummed SQL migrations, transaction-per-migration, advisory locking, and fail-closed handling for an existing untracked schema.
- Read-only migration inspection via `pnpm db:status`; apply changes with `pnpm db:migrate`.
- Health endpoint reports whether the database and migration ledger are ready.
- Organization consistency constraints cover related order, payment, refund, fulfillment and line-item references.
- Keep API validation, tenant authorization, transaction boundaries and idempotency aligned with database constraints.
- Remaining: inspect the intended Neon database, apply migrations safely, verify the ledger/tables, and finish the highest-risk API write-path review. Never claim live acceptance before connecting to the intended database.

## Phase 1 — Finish restaurant operations

**Status: in progress; this is the current implementation priority.**

Finish and verify the merchant-side restaurant journey using the existing components and APIs:

- Restaurant menu lifecycle: menus, service periods, categories, dishes, descriptions, prices, allergens, dietary labels, modifier groups, publishing and ordering.
- Availability changes must persist and be reflected in both the merchant UI and public menu.
- POS: register sessions, menu-item selection, modifier validation and server-side pricing, ticket creation, dine-in/takeaway/delivery details, payment recording, and order status transitions.
- Restaurant orders must remain consistent across POS records, canonical orders, payments, inventory and fulfillment.
- Preserve order-item and modifier snapshots so later menu edits do not rewrite historical tickets.
- Make errors actionable and ensure mutations refresh persisted API state. Avoid treating offline payment recording as a real payment-provider charge.
- The public menu is currently a published, read-only menu. Customer cart/checkout and Mageus ordering flows belong to the Mageus integration phase unless a separate first-party checkout requirement is agreed.
- Remaining: complete the restaurant workflow audit, address concrete UI/API gaps, and verify critical journeys with a focused production build and existing CI checks.

## Phase 2 — Finish stores and core commerce

**Status: in progress after restaurant operations.**

- Complete store management: list and create multiple stores, edit store details, switch the active store, and manage supported settings and publishing.
- Ensure the selected store scopes products, categories, menus, POS, inventory, orders, QR entry points, domains and storefront settings.
- Audit products and variants, customer records, inventory movements, order management, payments, refunds, fulfillment, QR entry points, permissions and developer credentials.
- Identify and close missing merchant-facing workflows rather than adding duplicate screens or replacing working components.
- Confirm organization and store boundaries at API and database layers.
- Remaining: browser review of key workflows and a concise inventory of any deferred capabilities, with their reasons.

## Phase 3 — Mageus and external-client integrations

**Status: planned; API and public-menu foundations exist.**

- Mageus remains the customer-facing discovery, publishing and experience layer; Dollareus remains the commerce engine and API provider.
- Connect published public catalog/menu projections to customer-facing cart, checkout and ordering/booking flows through authorized APIs.
- Implement shared identity through a proper cross-domain OAuth/OIDC flow with stable user IDs and explicit authorization.
- Expand API documentation, webhooks, idempotency guidance, rate limits and client integration boundaries.
- Avoid duplicated commerce records or bypassing tenant checks.
- Remaining: verify the full customer journey from Mageus to persisted Dollareus orders and back to merchant operations.

## Phase 4 — Production launch and operational readiness

**Status: pending.**

- Configure production API URL, database credentials, object storage, OAuth providers, email delivery, CORS, cookies and domain/TLS routing.
- Apply migrations as a controlled deployment step and verify production health/readiness.
- Run a focused staging acceptance pass covering authentication, tenant isolation, catalog/menu reads, order creation, stock, payments/refunds, fulfillment and recovery behavior.
- Verify backups and restore procedures, logging, error reporting, and rollback/recovery instructions.
- Release only after live integrations are verified.

## After launch

Operate and expand based on real usage: monitor errors and database performance, maintain forward-only migrations, fix issues found by merchants, and then prioritize webhooks/quotas/billing, additional fulfillment adapters, and new business modules based on actual demand.

## Working rules

- Build first and keep the development loop short.
- Do not add redundant tests or make broad test suites a development gate; retain existing CI and use focused checks when they protect a real risk.
- Never drop or reset a database to make migrations pass.
- Never edit a migration that has already been applied; add a new numbered migration.
- Do not claim live database acceptance until the intended Neon database has actually been inspected.
- Prefer narrow production fixes and preserve the existing architecture.
