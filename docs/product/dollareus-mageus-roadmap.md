# Dollareus + Mageus product roadmap

Last updated: 2026-10-11

## Non-negotiable product boundaries

- **Dollareus is the business operating system and API provider.** It owns operational data and workflows: organizations, products, menus, inventory, POS, customer/CRM records, orders, offline payment records, reservations, fulfillment, and audit history.
- **Mageus is the default storefront and customer-facing layer.** It owns public storefronts, publishing, magazines, communities, audience-building, discovery, and the experiences for buying and booking.
- **External client apps use Dollareus APIs.** A custom coffee website, restaurant app, booking product, or client-branded site can manage its catalog and orders through Dollareus without having to rebuild the operational backend.
- **One identity across Dollareus and Mageus.** Use a shared identity service and a proper OAuth/OIDC sign-in flow across domains. Keep app sessions and organization permissions separate. Do not duplicate password stores or rely on a cookie being shared between unrelated domains.
- **Guest checkout remains supported.** A customer record created by a business does not automatically mean the person needs a login. An optional customer account can provide cross-store history where the user has been verified and authorized.
- **No marketplace launch in the current roadmap.** A future marketplace is a separate strategic decision, not a prerequisite for Dollareus or Mageus.

## Phase 1 — reliable foundation

- [x] PostgreSQL schema, pool, and explicit fresh-database setup.
- [x] First-party password authentication, sessions, OAuth flows, email verification, and password recovery routes.
- [ ] Run the schema against the intended empty Neon database and verify tables.
- [ ] Run CI/build and smoke-test registration, login, session, and organization isolation.

## Phase 2 — core business API

- [x] Organizations, memberships, stores, products/variants, categories, customers, inventory, orders, and audit history.
- [x] Restaurant menu APIs and public published-menu projection.
- [x] Manual/offline payment records, partial-balance projection, and order-status audit.
- [x] Managed QR/direct-link entry points.
- [x] Manual shipment/fulfillment APIs: carrier, tracking number/link, expected delivery, notes, stages, and audited changes.
- [ ] Verify endpoint behavior with automated tests and a live Neon smoke test.
- [ ] Finish POS checkout, refund records, media upload/storage, and remaining operational actions.

## Phase 3 — finish the Dollareus merchant workspace

- [x] Merchant authentication and first-run organization/store setup.
- [x] Product, order, customer, inventory, and offline-payment interfaces.
- [x] Shipment tracking controls in the order manager.
- [x] Apply X-Facture's midnight/navy + money-green palette and improve baseline type/control sizes.
- [ ] Build-verify the Angular app and API typecheck; resolve every failure before calling the phase complete.
- [ ] Verify responsive layouts, keyboard focus, readable form labels, error states, and empty/loading states.
- [ ] Finish product editing/publishing, POS checkout, media management, refunds, and remaining operational actions.

## Phase 4 — turn the API into a sellable developer product

- [ ] Per-client API credentials with revocation, rotation, and organization/resource scopes.
- [ ] Explicit client applications and permissions; separate public read-only endpoints from privileged writes.
- [ ] Webhooks for product/menu changes, stock changes, order creation/status, booking changes, and fulfillment events.
- [ ] API versioning, rate limits, usage metering, logs, documentation, examples, and developer onboarding.
- [ ] Subscription/usage plans and billing once the API behavior and usage model are stable.
- [ ] A reusable client integration pattern so new branded sites can be built without rebuilding commerce operations.

## Phase 5 — integrate Mageus as the default storefront

- [ ] Shared identity/SSO across Dollareus and Mageus using OAuth/OIDC and stable user IDs.
- [ ] Authorized Mageus-to-Dollareus integration scoped to a store and its enabled modules.
- [ ] Public Mageus storefronts read the same Dollareus-owned products, menus, availability, and prices through APIs.
- [ ] Customer-facing guest checkout and optional customer profiles.
- [ ] Mageus order/booking flows create records through Dollareus APIs and show status to customers.
- [ ] Merchant edits in Dollareus update Mageus experiences without a redeploy.
- [ ] Customer tracking pages live in Mageus; carrier tracking links are supplied by the merchant or a future carrier integration.

## Phase 6 — adapters and vertical modules

Add only when real use cases justify them:

- Restaurant modifiers, pickup, delivery and kitchen workflow.
- Connectors to third-party food delivery and courier providers.
- Reservation and appointment adapters for freelancers and service businesses.
- Additional POS workflows, purchasing, stock transfers, and reporting.
- X-Facture document generation and QR tools as authorized shared engines.

## Definition of done before moving to Mageus

1. pnpm ci passes in CI.
2. Fresh Neon schema setup and API smoke tests pass without destructive database operations.
3. Login, signup, sessions, and organization isolation are verified.
4. Core merchant workflows are usable at desktop and mobile sizes with readable type and controls.
5. Orders, offline payments, and shipment stages work end-to-end with audit history.
6. API contracts and authorization boundaries are documented well enough for Mageus to integrate without direct database access.

Online payment gateways and a public marketplace are explicitly outside this completion gate.
