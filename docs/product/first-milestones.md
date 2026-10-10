# First milestones

## Foundation
- [x] Create repository and define product boundaries.
- [x] Establish Angular merchant workspace scaffold and first dashboard.
- [x] Define shared commerce transport contracts.
- [x] Document media-storage conventions.
- [x] Add CI build and API typecheck.
- [x] Select API runtime and persistence strategy (Fastify + Firebase Admin/Firestore foundation; reassess as transactional commerce needs are validated).
- [x] Define the smart-commerce boundary: one Dollareus catalog, multiple public experiences and connected channels.

## Merchant identity and stores
- [ ] Authentication provider and secure session handling in the merchant UI.
- [ ] Organization creation, memberships, roles and invitations.
- [ ] Server-side role-based authorization and audit events.
- [ ] Emulator/integration tests for tenant isolation and security rules.
- [x] Initial store creation, business-type selection, and storefront publish configuration API.
- [ ] Merchant UI to create/manage stores and configure business details.

## Shared catalog and public experiences
- [x] Product create/list API with schema validation.
- [x] Product update API with transactional slug changes.
- [x] Upload intents and initial object-storage workflow.
- [x] Store-scoped product association and basic catalog category creation API.
- [x] Public store and published catalog read API foundation.
- [ ] Product/category/variant editor in the merchant UI connected to the API.
- [ ] Public storefront renderer with commerce, menu, catalog, and services presentation modes.
- [ ] Cursor pagination hardening, public storefront projections, cache validators, and canonical metadata.
- [ ] Image file-signature validation, processing and safe delivery URLs.
- [ ] Stable QR/link entry-point management and QR generation; entry points must reference the canonical public store, never duplicate catalog data.
- [ ] Verify store slug changes preserve printed QR links through managed redirects.

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
Restaurant-specific availability windows, dietary/allergen information, tables, POS, kitchen display and ordering; retail inventory/POS; appointments and scheduling; digital-goods delivery; shipping; reporting; and X-Facture document integration. These should extend the shared commerce core rather than introduce parallel store/catalog systems.
