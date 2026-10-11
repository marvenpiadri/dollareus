# Restaurant rollout plan

This plan deliberately finishes one restaurant capability at a time. Do not start a later phase until the current phase's exit criteria are met and the required checks pass.

## Phase 1 — Menu management and public menu (current)

### Scope
- Restaurant menus and menu items: create, edit, order/position, draft/active state, publish/unpublish.
- Store-scoped categories, prices/currency, availability, allergens and dietary labels.
- Modifier groups/options and server-side validation of modifier selection and price deltas.
- Public menu page at the store menu URL, with only published menus and active items.
- Public availability semantics: unavailable dishes are hidden; limited-availability dishes remain visible and clearly labelled.
- Branded QR entry points that resolve to the correct public menu.
- Tenant/role authorization and API smoke coverage for the above.

### Exit criteria
- [ ] A manager can create/edit a menu and dishes, set categories and dietary/allergen information, and publish/unpublish.
- [ ] Modifier constraints and prices are validated server-side; invalid cross-store category references are rejected.
- [ ] Public pages never expose unpublished stores/menus or draft/archived/unavailable dishes.
- [ ] Limited availability is visible to customers rather than silently appearing fully available.
- [ ] Public menu works at phone and desktop widths with clear loading, empty, and error states.
- [ ] QR destination and branding are correct for the configured deployment URL.
- [ ] Latest CI passes and a browser-level staging walkthrough passes.

### Current evidence and remaining work
- Implemented: manager-authorized menu creation, editing of menu name/slug/description/service periods, publish/unpublish, dish creation and editing (name/slug/description/price/category/allergens/dietary labels/modifier groups), availability controls, public menu rendering, storefront publishing, and branded QR destinations.
- Public menu API now requires the store to be published and the `menu` experience to be enabled. The product catalog API independently requires `commerce` or `catalog` to be enabled. Automated smoke coverage verifies the menu is hidden when that experience is disabled, while an enabled catalog remains accessible.
- Latest build, API type-check, and PostgreSQL-backed API smoke tests passed after menu editing and public experience gating: [run 38170647095](https://github.com/marvenpiadri/dollareus/actions/runs/38170647095).
- Still required before Phase 1 closure: browser-level mobile/desktop walkthrough, visual/accessibility review, live database/schema verification, and real deployed URL/TLS/QR verification.

## Phase 2 — Restaurant POS ticket workflow

### Scope
- Open/close register sessions and handle interrupted sessions safely.
- Add multiple menu items to a ticket, select modifiers, change quantities, and show clear totals.
- Keep server-side pricing authoritative; prevent duplicate or invalid ticket lines.
- Record cash/manual payment only after it has been collected; clearly distinguish recorded payments from online payment processing.
- Ticket/order status transitions, receipt/ticket detail, error recovery, and staff permissions.

### Exit criteria
- [ ] Browser-level staff walkthrough passes for a normal sale and failure cases.
- [ ] Totals and modifiers match server calculations.
- [ ] Duplicate requests are safe and order/payment state remains consistent.
- [ ] No card-processing capability is advertised unless a real provider is integrated.

## Phase 3 — Stock and cancellation correctness

### Scope
- Transactional deduction of tracked stock on the agreed POS completion event.
- Stock movement history, concurrent sales/insufficient-stock protection, and safe cancellation/refund rules.
- Decide explicitly how stock is restored on cancellation/refund.
- Ingredient/BOM tracking is a separate enhancement after basic stock correctness.

### Exit criteria
- [ ] No negative stock from concurrent register sales.
- [ ] Cancellation/refund behavior and stock restoration are documented and tested.
- [ ] Audit trail explains each stock movement.

## Phase 4 — Controlled staging and first restaurant pilot

### Scope
- Verify production-like Neon database connectivity and schema setup.
- Verify S3-compatible image storage round trip.
- Configure production auth/email/OAuth, HTTPS, CORS, cookies, public URL, and secrets.
- Add health/uptime/error monitoring, backup/restore check, deployment rollback, and support procedure.
- Run end-to-end tests with one controlled restaurant using test data.

### Exit criteria
- [ ] Real staging environment passes authentication, menu, QR, POS, and stock workflows.
- [ ] Backups and restore are verified; secrets are rotated and stored only in the host's secret manager.
- [ ] No real online payments are accepted until a provider, signed webhooks, reconciliation, and actual refund handling are complete.

## Phase 5 — Customer ordering and integrations

### Scope
- Customer cart, checkout, order confirmation, and restaurant order acceptance.
- Real payment provider, signed webhooks, idempotency, reconciliation, and provider refunds.
- Optional later adapters for printers, kitchen display systems, physical terminals, and delivery partners.

### Exit criteria
- [ ] Online order/payment lifecycle is tested end to end.
- [ ] Each hardware, payment, or delivery integration has its own adapter-level acceptance tests.

## Release rule

The first release target is a **controlled restaurant pilot**, not a promise of a fully featured restaurant POS or public commerce platform. Finish and verify Phase 1 before expanding Phase 2. Keep future ecommerce, Mageus, delivery, and broad integrations out of the current implementation scope.
