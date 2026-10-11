# Smart POS: one transaction engine, domain-specific workflows

## Product decision

Dollareus POS is an operational client of the Dollareus commerce platform, not a separate inventory/catalog system. It consumes the canonical store and domain records and writes shared, auditable order records. POS orders carry a channel and immutable item/price snapshots so later catalog edits do not rewrite historical receipts.

The POS is **smart because it adapts to the store's enabled domains and fulfillment workflow**, not because all business types are forced into the same UI or item model.

## Shared POS core

- Store, organization, staff identity and authorization.
- Terminal sessions with an open/closed lifecycle.
- Order numbering and order records.
- Server-side item/variant validation and price calculation in integer minor currency units.
- Order line snapshots, currency, totals, source channel and fulfillment type.
- Future payment-provider adapters, receipts, refunds, audit log and reporting.

## Domain adapters

### Retail
- Select a canonical product and active variant.
- Future: barcode lookup, stock by location, returns, discounts, tax rules and receipt printers.
- Inventory changes must be ledgered and transactionally coordinated with order completion; do not decrement stock from the browser.

### Restaurant
- Select active menu items from restaurant menus.
- Fulfillment can be dine-in, takeaway or delivery, with an optional table label.
- Future: modifier groups and priced add-ons, table map, kitchen tickets, prep stations, course/fire sequencing, item availability windows, and kitchen display.
- A menu item remains a restaurant-domain record, not a disguised retail product.

### Services
- Record a service sale and payment against the service domain.
- Future: staff assignment, appointment scheduling, deposits and booking validation.

## API foundation currently added

- `GET/POST /api/v1/organizations/:organizationId/stores/:storeId/menus`
- `GET/POST /api/v1/organizations/:organizationId/stores/:storeId/menus/:menuId/items`
- `GET /api/v1/public/stores/:storeSlug/menus` — published menu projection.
- `GET/POST /api/v1/organizations/:organizationId/stores/:storeId/pos/sessions`
- `PATCH /api/v1/organizations/:organizationId/stores/:storeId/pos/sessions/:sessionId/close`
- `GET/POST /api/v1/organizations/:organizationId/stores/:storeId/pos/orders`
- `PATCH /api/v1/organizations/:organizationId/stores/:storeId/pos/orders/:orderId/status` — validated order transitions with actor/time history.

The current order-creation route re-reads canonical product/menu/service prices on the server, rejects inactive or cross-store items, checks the session is open, snapshots line names/prices, and assigns an order number. The initial merchant POS screen supports opening/closing registers and retail product orders with validated status transitions. Orders are stored in the POS-specific tables; the current POS UI does **not** record payment, calculate jurisdictional taxes, apply discounts, decrement inventory, or send kitchen tickets. Restaurant menu-item orders are supported by the API but not yet exposed in the POS UI. Do not present those capabilities as implemented.

## Important safety and correctness requirements before production

1. Add tests for cross-store item IDs, stale/inactive variants, closed sessions, duplicate line items, totals, concurrent order numbering and currency mismatch.
2. [x] Enforce operator roles for POS writes; record audit events and support order idempotency. Define stricter session ownership/shift reconciliation before production.
3. Add payment adapters and a durable payment state machine; an order must not imply a card payment succeeded.
4. Add inventory ledger/reservation semantics for retail and kitchen ticket state for restaurants.
5. Extend the initial validated order status transitions with domain-specific policies, payment-aware completion rules and audited actor IDs.
6. Support offline POS only after defining local persistence, conflict handling, replay protection and safe reconciliation.
7. Add modifiers and tax/discount calculation as domain-specific pricing extensions, not client-trusted totals.
8. Keep payment card data out of Dollareus; use a compliant payment provider and store only provider references and non-sensitive status.

## Non-goals for this foundation

No payment processing, stock decrement, fiscal receipt certification, card-terminal integration, offline sync, kitchen display, or production hardware integrations are implied by the initial routes.
