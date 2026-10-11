# Dollareus restaurant-first delivery plan

Last reviewed: 2026-10-11

## Working rule

Work on restaurant workflows only until the restaurant pilot is dependable. Complete one phase, verify its acceptance criteria, and only then start the next. Do not expand retail, delivery marketplaces, or unrelated platform features during this sequence. A green CI run proves automated checks passed; it does not prove a live deployment is configured or ready for real customers.

## Phase 1 — Public restaurant menu and QR entry

**Goal:** A guest can scan a restaurant QR code or open its public menu without signing in and see accurate, safe-to-understand menu information.

Included:
- Publish/unpublish controls and menu-experience gating.
- Public restaurant menu page with restaurant identity and published active menus.
- Dishes grouped by category, with price, description, limited/unavailable state, dietary labels, allergens, and modifier information.
- Branded QR entry points that lead to the right restaurant menu.
- Public endpoints must not leak unpublished stores, disabled experiences, or unavailable dishes.

Acceptance gate:
- [x] Merchant and API implementation exists.
- [x] API smoke checks cover publish gating, disabled experience, unavailable/limited dishes, modifier data, and QR destination privacy.
- [x] Public menu smoke check verifies category name, allergens, and dietary labels. Passed in [CI run 38171550934](https://github.com/marvenpiadri/dollareus/actions/runs/38171550934).
- [ ] Browser/manual test on desktop and a real phone-sized viewport: direct URL, QR destination, loading/error/empty states, long dish names, and narrow-screen layout.
- [ ] Verify the live deployed URL, HTTPS, and QR destination against the actual configured domain.

Do not move this phase to “complete” until browser/manual and live-environment checks are recorded.

## Phase 2 — Restaurant menu management

**Goal:** A restaurant manager can maintain a menu accurately without editing database records or JSON by hand.

Included:
- Create and edit menus, service periods, categories, dishes, descriptions, prices, availability, allergens, dietary labels, and modifier groups/options.
- Role and tenant/store isolation.
- Clear validation and useful error feedback for invalid prices, duplicate/invalid options, category mismatches, and malformed modifier definitions.
- Verify edits appear on the public menu after refresh and that draft/archived content stays private.

Acceptance gate:
- [ ] Walk through the entire create → edit → publish → change availability → unpublish workflow in the merchant UI.
- [ ] Exercise required/optional modifiers, min/max selections, price deltas, and invalid modifier definitions.
- [ ] Confirm all changes persist after reload and do not affect another store.
- [ ] Record a browser/manual verification result before moving on.

## Phase 3 — Restaurant POS and kitchen order workflow

**Goal:** Staff can open a register, build a multi-item ticket, record an order, and advance it safely through preparation and completion.

Included:
- Register sessions and role restrictions.
- Multi-line tickets, quantities, modifiers, notes, takeaway/counter fulfillment, authoritative server pricing, and idempotency.
- Clear order states for staff (new/confirmed, preparing, ready, completed, cancelled).
- Prevent completion when tracked stock is insufficient; ensure cancellations and retries do not cause duplicate deductions or corrupt history.
- Distinguish restaurant dishes from retail products in the interface.

Acceptance gate:
- [x] API smoke coverage exists for register sessions, multi-line modifier tickets, status transitions, idempotency, stock checks, and order/payment/refund history.
- [ ] Browser/manual test the complete workflow as a staff member on a narrow and desktop screen.
- [ ] Review concurrent completion/retry and cancellation behavior, including the effect on inventory.
- [ ] Confirm staff can understand order state at a glance without relying on API knowledge.

Current POS is an in-app register/order flow. It is not yet a certified fiscal cash register and does not include card-terminal integration, receipt-printer/KDS integration, or delivery-platform adapters.

## Phase 4 — Restaurant payment and end-of-day safety

**Goal:** Staff can reconcile what happened without confusing recorded cash with a real online charge.

Included:
- Cash/offline payment recording, payment history, manual refund records, and audit trail.
- Explicitly label manual payment/refund actions; never imply money moved through a payment provider when it did not.
- Validate partial/full refunds, over-refund prevention, duplicate requests, paid-order cancellation rules, and close-register guards.
- Define what staff do when a payment is disputed, an order is cancelled, or a register is closed.

Acceptance gate:
- [x] API smoke coverage exists for manual payment/refund records, partial/full refunds, idempotency, and register close guards.
- [ ] Browser/manual test a complete shift scenario and verify order, payment, and refund history agree.
- [ ] Real card payments remain disabled until a provider, webhook signature validation, reconciliation, and actual refund handling are implemented and verified.

## Phase 5 — Private restaurant pilot and deployment

**Goal:** One or two invited restaurants can use the product in a controlled setting before public signup or real-payment launch.

Included:
- Dedicated staging and production database configuration, schema verification, backups/restore test, secrets, CORS, secure cookies, HTTPS, logs, and health checks.
- Email/authentication provider configuration and real account lifecycle tests.
- Live object-storage round-trip if dish/product media is enabled.
- Domain/TLS/routing checks and QR scan test on a real device.
- Security, privacy, legal/business requirements, support, and recovery runbook.

Acceptance gate:
- [ ] Latest CI is green on the final candidate commit.
- [ ] Staging walkthrough passes using a clean restaurant account.
- [ ] Live database, auth, QR/domain, and any enabled storage integrations are verified.
- [ ] Pilot boundaries are documented; no real online payments until the payment gate is closed.
- [ ] Only after the pilot is stable should public launch readiness be reconsidered.

## Current execution position

Phase 1 remains the active phase. The public menu UI and API behavior are implemented, and the latest CI checks passed: category grouping in [run 38171271714](https://github.com/marvenpiadri/dollareus/actions/runs/38171271714), public category/allergen/dietary assertions in [run 38171550934](https://github.com/marvenpiadri/dollareus/actions/runs/38171550934), and the latest branch run [38171576417](https://github.com/marvenpiadri/dollareus/actions/runs/38171576417). Phase 1 is not yet closed because browser/manual and live deployment checks are environment-dependent and have not been recorded.
