# First milestones

## Foundation
- [x] Create repository and define product boundaries.
- [x] Establish Angular merchant workspace scaffold and first dashboard.
- [x] Define shared commerce transport contracts.
- [x] Document media-storage conventions.
- [x] Add CI build and API typecheck.
- [x] Select API runtime and persistence strategy (Fastify + Firebase Admin/Firestore foundation; reassess as transactional commerce needs are validated).

## Merchant identity
- [ ] Authentication provider and secure session handling in the merchant UI.
- [ ] Organization creation, memberships, roles and invitations.
- [ ] Server-side role-based authorization and audit events.
- [ ] Emulator/integration tests for tenant isolation and security rules.

## Catalog and media
- [x] Product create/list API with schema validation.
- [x] Product update API with transactional slug changes.
- [x] Upload intents and initial object-storage workflow.
- [ ] Product/category/variant editor in the merchant UI connected to the API.
- [ ] Image file-signature validation, processing and safe delivery URLs.
- [ ] Cursor pagination and public storefront projection for draft/published products.

## Commerce
- [ ] Cart, checkout session, orders, refunds and order history.
- [ ] Idempotency and transactional stock reservation.
- [ ] Currency-aware money and tax calculation interfaces.
- [ ] Payment provider abstraction; Dollareus must not store card data.

## Mageus channel
- [ ] Scoped account connection and authorization.
- [ ] Storefront read API and product publishing integration.
- [ ] Order channel attribution and reliable events.
- [ ] Integration contract tests.

## Later modules
Retail inventory/POS, restaurant menus/tables/kitchen display, QR engine, X-Facture document integration, appointments, shipping, digital products and reporting.
