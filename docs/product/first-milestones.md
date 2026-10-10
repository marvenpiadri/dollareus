# First milestones

## Foundation
- [x] Create repository and define product boundaries.
- [x] Establish Angular merchant workspace scaffold and first dashboard.
- [x] Define shared commerce transport contracts.
- [x] Document media-storage conventions.
- [x] Add CI build and API typecheck.
- [x] Select API runtime and persistence strategy (Fastify + PostgreSQL; first-party authentication).
- [x] Define the smart-commerce boundary: one Dollareus catalog, multiple public experiences and connected channels.

## PostgreSQL reset
- [x] Create a fresh schema without column defaults.
- [x] Add guarded one-time schema setup and remove versioned migrations.
- [x] Remove Firestore persistence and configuration.
- [ ] Execute the schema in the empty Neon database and verify tables.
- [ ] Complete PostgreSQL route parity and integration tests.

## Merchant identity and stores
- [x] Add PostgreSQL-backed email/password registration, login, logout, and session endpoints.
- [x] Add Google and Facebook OAuth API flows.
- [x] Connect merchant UI to authentication and build sign-in/register, verification, and recovery screens.
- [x] Implement email verification and password reset API flows (provider configuration and live testing still required).
- [ ] Add account security management, session revocation UI, and resend-verification action.
- [x] PostgreSQL organization creation and owner membership API.
- [ ] Merchant UI organization onboarding, staff memberships, roles and invitations.
- [ ] Server-side role-based authorization and audit events.
- [ ] Emulator/integration tests for tenant isolation and security rules.
- [x] Initial store creation, business-type selection, and storefront publish configuration API.
- [ ] Merchant UI to create/manage stores and configure business details.

## Shared catalog and public experiences
- [x] Product create/list API with schema validation.
- [ ] PostgreSQL product update API with transactional slug changes.
- [ ] Reimplement upload intents and media verification against the new PostgreSQL data model and object storage.
- [ ] Reimplement store-scoped product association and catalog category APIs against PostgreSQL.
- [x] Public store and published catalog read API foundation.
- [ ] Product/category/variant editor in the merchant UI connected to the API.
- [ ] Public storefront renderer with commerce, menu, catalog, and services presentation modes.
- [ ] Cursor pagination hardening, public storefront projections, cache validators, and canonical metadata.
- [ ] Image file-signature validation, processing and safe delivery URLs.
- [ ] Stable QR/link entry-point management and QR generation; entry points must reference the canonical public store, never duplicate catalog data.
- [ ] Verify store slug changes preserve printed QR links through managed redirects.

## Restaurant domain and smart POS
- [x] Define separate PostgreSQL tables for restaurant menus/menu items and retail products.
- [ ] Reimplement authenticated menu and menu-item APIs against PostgreSQL.
- [ ] Reimplement the public published-menu projection against PostgreSQL.
- [ ] Reimplement POS sessions and server-priced order creation with immutable line snapshots against PostgreSQL.
- [ ] Add update/archive workflows and menu modifier groups.
- [ ] Reimplement validated POS order status transitions with actor/time history against PostgreSQL.
- [ ] Add idempotency keys, staff roles and audit events.
- [ ] Add payment-provider adapters, tax/discount rules and payment reconciliation.
- [ ] Add inventory ledger and stock reservation for retail; kitchen tickets and preparation workflow for restaurants.
- [ ] Add POS integration tests, including tenant isolation and concurrent order numbering.

## Mageus and external channels
- [ ] Scoped integration connection and authorization.
- [ ] Mageus store page renders the same Dollareus catalog through an authorized API.
- [ ] Channel attribution for orders and reliable events.
- [ ] Integration contract tests, revocation tests, and tenant-isolation tests.
- [ ] Document external API scopes so future applications can integrate without sharing merchant secrets.

## Commerce
- [ ] Cart, checkout session, orders, refunds and order history.
- [ ] Idempotency and transactional stock reservation.
- [ ] Currency-aware money and tax calculation interfaces.
- [ ] Payment provider abstraction; Dollareus must not store card data.

## Later modules
Restaurant table management, modifier groups, kitchen display and preparation workflows; retail inventory ledger, barcode scanning and returns; appointments and scheduling; digital-goods delivery; shipping; reporting; payments, refunds, fiscal receipt requirements, offline POS sync; and X-Facture document integration. These should extend the shared commerce core rather than introduce parallel store/catalog systems.
