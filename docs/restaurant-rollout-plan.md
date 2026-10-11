# Dollareus restaurant rollout plan

> Architecture work is tracked separately from restaurant feature acceptance. The Angular merchant client is being standardized on Angular 22 with external templates/styles and feature-oriented folders. API and shared packages remain outside Angular `src/` as part of the workspace monorepo.

This is the execution plan for the restaurant pilot. Complete each phase's exit gate before starting the next. Keep retail expansion, Mageus, delivery marketplaces, and broad integrations out of scope until the restaurant pilot is dependable.

## Phase 1 — Public menu and QR entry (active)

### Goal
A guest can open a restaurant-specific URL or scan its QR code and see an accurate, public menu without signing in.

### Included
- Published-store and enabled-menu-experience gating.
- Published menus and active dishes only.
- Dishes grouped by category with prices, descriptions, allergens, dietary labels, modifier information, and clear limited-availability labels.
- Unavailable dishes, draft menus, and unpublished stores stay hidden.
- Branded QR entry points resolve to the right restaurant menu.
- Public menu loading, error, and empty states.

### Verified in repository/CI
- Public menu page and API are implemented.
- Category grouping is implemented in [CI run 38171271714](https://github.com/marvenpiadri/dollareus/actions/runs/38171271714).
- Public menu API smoke checks verify category name, allergens, dietary labels, modifier groups, limited availability, and hiding unavailable dishes in [CI run 38171550934](https://github.com/marvenpiadri/dollareus/actions/runs/38171550934).
- Latest branch CI passed in [run 38171576417](https://github.com/marvenpiadri/dollareus/actions/runs/38171576417).

### Exit gate — still open
- [ ] Browser walkthrough at desktop and phone widths: direct URL, QR destination, loading/error/empty states, long dish names, and narrow-screen layout.
- [ ] Review keyboard navigation, contrast, and screen-reader labels.
- [ ] Verify the live deployment URL, HTTPS, QR target, and configured branding.
- [ ] Confirm public menu behavior against the actual deployed database and configuration.

**Do not start Phase 2 until these checks are recorded.** Automated CI passing is necessary, but not a substitute for browser/live verification.

## Phase 2 — Restaurant menu management

### Goal
A restaurant manager can maintain the menu entirely through the merchant workspace.

### Included
- Create, edit, reorder, publish, and unpublish menus.
- Manage service periods, categories, dish names/descriptions/prices, availability, allergens, and dietary labels.
- Manage modifier groups/options, including required/optional selection and price deltas.
- Validate modifier constraints and store/category scope server-side.
- Ensure edits persist after reload and draft/archived content remains private.

### Exit gate
- [ ] Walk through create → edit → publish → change availability → unpublish.
- [ ] Exercise required/optional modifiers, min/max selections, price deltas, and invalid definitions.
- [ ] Verify tenant isolation and persistence after reload.
- [ ] Record a browser/manual walkthrough before moving on.

## Phase 3 — Restaurant POS and kitchen ticket workflow

### Goal
Staff can build and progress a restaurant ticket without confusing menu items with retail products.

### Included
- Register sessions, multiple ticket lines, quantities, modifiers, notes, and server-authoritative totals.
- Clear order states for new/confirmed, preparing, ready, completed, and cancelled.
- Role checks, retry/idempotency behavior, and clear error recovery.
- Cash/offline payment recording only when collected; never imply that a manual record is an online charge.

### Exit gate
- [ ] Browser walkthrough of normal sales and failure cases on desktop and narrow screens.
- [ ] Verify totals and modifier deltas against server calculations.
- [ ] Review duplicate requests, concurrent completion, and cancellation behavior.
- [ ] Clearly distinguish manual/offline payment records from online processing.

The current POS is an in-app register/order workflow. It is not a certified fiscal cash register and does not yet include card-terminal, receipt-printer, kitchen-display, or delivery-platform adapters.

## Phase 4 — Stock and cancellation correctness

### Goal
Tracked inventory remains correct during sales, retries, cancellation, and refund workflows.

### Included
- Transactional stock deduction at an explicitly chosen POS/order transition.
- Concurrency-safe insufficient-stock checks and stock movement history.
- Explicit cancellation/refund stock-restoration rules.
- Ingredient/BOM tracking only after basic stock correctness is proven.

### Exit gate
- [ ] Concurrent sales cannot produce negative tracked stock.
- [ ] Cancellation/refund and stock restoration behavior is documented and tested.
- [ ] Stock movement audit trail explains each adjustment.

## Phase 5 — Controlled staging and first restaurant pilot

### Goal
One invited restaurant can use Dollareus in a controlled environment with test data and a clear support/recovery process.

### Included
- Separate staging and production databases; verify schema and safe setup/migration procedure.
- Verify live Neon connectivity and S3-compatible image upload/read/cleanup if media is enabled.
- Configure authentication, email/OAuth, HTTPS, CORS, secure cookies, public URL, and host-managed secrets.
- Health/error monitoring, backups, restore test, rollback plan, and support runbook.
- Real device QR scan and domain/TLS/routing verification.

### Exit gate
- [ ] Latest CI passes on the final pilot candidate.
- [ ] Clean-account staging walkthrough passes for menu, QR, POS, and stock.
- [ ] Live database, auth, URL/domain, and any enabled storage integrations are verified.
- [ ] Secret rotation and backup/restore checks are recorded.
- [ ] Pilot limits and rollback/support procedures are documented.

## Phase 6 — Customer ordering and integrations (later)

### Goal
Enable online orders and external systems only after the in-restaurant workflow is reliable.

### Included
- Customer cart, checkout, order confirmation, and restaurant order acceptance.
- Payment provider, signed webhooks, idempotency, reconciliation, and actual provider refunds.
- Separate acceptance tests for physical terminals, printers/KDS, and delivery partners.

### Exit gate
- [ ] Online order/payment lifecycle passes end to end.
- [ ] Provider refunds and webhook failure/retry paths are verified.
- [ ] Each hardware/payment/delivery adapter has independent acceptance tests.

## Current execution position

**Phase 1 automated implementation is in place; live/manual acceptance is deferred for the owner to test later.** The user has explicitly asked to proceed with Phase 2 before recording the browser, live URL/TLS, and physical QR checks. Keep those Phase 1 checks open; do not represent them as passed.

**Phase 2 — in progress:** authenticated create/edit/publish/unpublish and dish availability APIs are in place; the merchant workspace now exposes up/down controls for menu and dish ordering, backed by transactional full-list reorder endpoints. Request examples and error contracts are documented in [Restaurant Phase 2 API](restaurant-phase-2-api.md).

- Regression smoke tests cover successful reordering, stale/incomplete ordering requests, rejection of viewer-role writes, required/optional modifier selection bounds, duplicate modifier/option IDs on both create and edit, persisted option price edits, and public-menu projection of saved modifier configurations.
- Direct-to-main CI passed the Angular production build, SSR rendering check, API typecheck, and PostgreSQL-backed HTTP integration smoke suite in [run 38179807815](https://github.com/marvenpiadri/dollareus/actions/runs/38179807815).
- Remaining Phase 2 exit checks: manually walk through create → edit → publish → change availability → unpublish; verify tenant isolation and persistence after reload on the deployed app. These browser/manual checks can be performed by the owner later, so Phase 2 remains open until recorded.

No real online payments should be accepted before the relevant payment-provider and reconciliation work is complete.

### Phase 3 implementation update — in progress

Per the owner's instruction, Phase 3 implementation may proceed while the remaining Phase 2 browser acceptance is deferred for the owner to perform later. This does **not** mark Phase 2 accepted or complete; its exit gate remains open.

- POS sessions and ticket APIs support role checks, server-authoritative product/menu pricing, modifier validation, idempotent order creation, order status transitions, audit history, and stock deduction on completion.
- API smoke coverage exercises multi-line tickets, distinct modifier selections, idempotent replay, status completion, stock deduction/insufficient stock, cancellation/refund safeguards, canonical order/payment linkage, and rejection of viewer-role writes. Direct-to-main CI also now verifies that cancelling an uncompleted product ticket leaves stock unchanged, and that concurrent completion-versus-cancellation deducts stock only if completion wins ([run 38178730306](https://github.com/marvenpiadri/dollareus/actions/runs/38178730306)).
- The POS UI now preserves its order idempotency key until ticket creation succeeds and uses a stable payment-attempt key derived from order, outstanding balance, and payment method. This protects retries after a lost response from silently creating duplicate tickets or manual payment records.
- The retry hardening was merged in [PR #27](https://github.com/marvenpiadri/dollareus/pull/27). Live browser walkthrough and manual payment workflow acceptance remain open.

Next Phase 3 work should focus on operator-facing failure recovery and ticket workflow usability, then verify concurrent status transitions and retry cases in CI. Do not claim certification for fiscal registers or real card processing.
