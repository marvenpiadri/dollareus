# Architecture overview

## Product boundary
Dollareus is a standalone, API-first commerce platform and the source of truth for store/catalog data. It serves its own merchant interface and authorized clients such as Mageus and, potentially, future applications. Mageus owns publishing, communities, audience, and discovery; Dollareus owns commerce records and workflows.

## Planned monorepo
- `apps/merchant`: Angular merchant workspace.
- `apps/api`: versioned Fastify API.
- `packages/contracts`: transport-safe TypeScript contracts shared by clients.
- Future packages: domain logic, API client, UI primitives, QR adapter, X-Facture document adapter.

Keep business rules testable without browser or cloud SDKs. Avoid importing Angular UI into domain packages.

## Core domains
1. Identity and organizations: users, memberships, roles, permissions, invitations.
2. Stores and channels: store configuration, public experiences, stable entry points, and connected applications.
3. Catalog: products/items, variants, categories, collections, prices, media references, availability, and publication state.
4. Commerce: carts, checkout sessions, orders, line-item snapshots, refunds.
5. Inventory: locations, stock levels, reservations, movements, adjustments.
6. Optional business modules: restaurant service, POS, purchasing, CRM, appointments and digital goods.
7. Integrations: Mageus, authorized external apps, X-Facture, QR/link generation, payment providers, shipping and notifications.

## One source of truth; many presentations
Do not model every presentation as a separate store type. Keep these dimensions separate:
- Business type: restaurant, retail, services, freelancer, digital, general.
- Catalog item kind: physical, digital, service, food/drink.
- Experience: commerce, menu, catalog, services.
- Channel: Dollareus, Mageus, authorized external application.
- Entry point: direct URL, QR code, or embed.

A restaurant's menu is a public presentation over its catalog. A QR code is a stable pointer to that presentation. A Mageus store is another channel rendering the same catalog. None of these should create a parallel store or duplicate products/prices. Domain-specific restaurant behavior can be added as a module when required, but common catalog identity and publication remain in the core.

See [smart commerce architecture](smart-commerce.md) for the model and proposed integration contract.

## Invariants
- Every private business resource is scoped to an organization and authorized server-side.
- Storefronts and channels are presentations/access paths, not duplicate catalogs.
- A product's identity and stock ownership must not be duplicated across Mageus and Dollareus.
- Public APIs expose only explicitly published records and a minimal public projection.
- Money is integer minor units plus an explicit currency; never use floating-point money.
- Order lines snapshot names, quantities, prices, discounts, and tax decisions at purchase time.
- Stock changes are explicit movements, not arbitrary client writes to a stock count.
- External side effects must be idempotent and traceable.
- Currency, locale, and timezone are explicit; never assume every business uses the same settings.

## API conventions
- Begin with `/api/v1`; document requests, responses, error codes, pagination, and authorization.
- Use stable IDs and cursor pagination.
- Validate input on the server. Derive organization membership from verified identity, never an untrusted request body.
- Use idempotency keys for checkout, order creation, and webhook handling.
- Use reliable events/outbox patterns for cross-service side effects.
- Version breaking contract changes deliberately.

## Persistence and security
PostgreSQL is the sole persistence layer for application/business records. The fresh schema is defined in `apps/api/db/schema.sql`; the one-time `pnpm db:setup` command only creates tables in an empty public schema and refuses to modify a non-empty one. There is no Firestore data migration and no versioned migration runner. Firebase Auth is currently retained only for ID-token verification. The PostgreSQL API reset is in progress; consult [the reset status](postgresql-reset-status.md) for endpoint coverage and outstanding work.

Deny access by default. Enforce organization isolation and roles on the server. Keep secrets out of source control and browser bundles. Apply rate limits, request validation, audit logs, and observability to sensitive operations. Storage paths are identifiers, not authorization by themselves. Public routes must never return raw organization documents or drafts.

## Market readiness
Morocco, France, and New York require explicit locale, timezone, currency, tax, address, payment, and privacy configuration. Do not hardcode tax rates or assume one legal invoice format. Country-specific tax and invoicing rules must be validated before production.
