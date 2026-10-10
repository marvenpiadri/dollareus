# Architecture overview

## Product boundary
Dollareus is a standalone, API-first commerce platform. It serves its own merchant interface and authorized clients such as Mageus. Mageus owns publishing, communities, audience, and discovery; Dollareus owns commerce records and workflows.

## Planned monorepo
- `apps/merchant`: Angular merchant workspace.
- `apps/api`: planned versioned server API.
- `packages/contracts`: transport-safe TypeScript contracts.
- Future packages: domain logic, API client, UI primitives, QR adapter, X-Facture document adapter.

Keep business rules testable without browser or cloud SDKs. Avoid importing Angular UI into domain packages.

## Core domains
1. Identity and organizations: users, memberships, roles, permissions, invitations.
2. Stores and channels: store configuration and connected storefronts.
3. Catalog: products, variants, categories, collections, prices, media references.
4. Commerce: carts, checkout sessions, orders, line-item snapshots, refunds.
5. Inventory: locations, stock levels, reservations, movements, adjustments.
6. Business modules: POS, restaurant service, purchasing, CRM, appointments and digital goods.
7. Integrations: Mageus, X-Facture, QR engine, payment providers, shipping and notifications.

## Invariants
- Every private business resource is scoped to an organization and authorized server-side.
- Storefronts are channels connected to a store, not duplicate catalogs.
- A product's identity and stock ownership must not be duplicated across Mageus and Dollareus.
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
Firestore is a candidate for real-time data and Firebase Auth integration, but validate inventory transactions, reporting, queries, audit requirements, exportability, and cost before making it the source of truth for every domain. Keep contracts independent of storage SDKs.

Deny access by default. Enforce organization isolation and roles on the server. Keep secrets out of source control and browser bundles. Apply rate limits, request validation, audit logs, and observability to sensitive operations. Storage paths are identifiers, not authorization by themselves.

## Market readiness
Morocco, France, and New York require explicit locale, timezone, currency, tax, address, payment, and privacy configuration. Do not hardcode tax rates or assume one legal invoice format. Country-specific tax and invoicing rules must be validated before production.
