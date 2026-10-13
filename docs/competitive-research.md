# Competitive research and product decisions

Last reviewed: 13 October 2026

Benchmark sources: Square modifier and multi-channel menu documentation, Toast restaurant POS/offline operations documentation, Shopify multi-location inventory documentation, and Moroccan digital-menu providers listed below. This is a directional UX benchmark, not a feature-parity claim.

This is a product-design reference, not a claim that Dollareus currently matches every competitor feature. Competitor pages are vendor-published and should be rechecked before pricing, positioning, or launch decisions.

## Research set

### Restaurant POS and operations

- **Toast** — [restaurant POS comparison](https://pos.toasttab.com/compare) and [restaurant POS guide](https://pos.toasttab.com/blog/on-the-line/restaurant-pos-guide). Restaurant-first workflows, modifiers, table service, course management, kitchen displays, support and resilience are core differentiators.
- **Square** — evaluated alongside Toast as the more approachable multi-vertical POS benchmark. The key lesson is to make basic checkout and setup feel simple without preventing more advanced restaurant workflows.
- **Shopify POS** — [multi-location inventory](https://help.shopify.com/en/manual/inventory-and-locations/setup/multi-managed-inventory) and [POS inventory tracking](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/inventory-management/products). Inventory needs clear per-location quantities, available/reserved distinctions, and a consistent relationship between catalog, POS and stock movements.

### Moroccan digital-menu and ordering products

- **QR MENU** — [Moroccan product page](https://www.qr-menu.ma/ma) and [pricing](https://www.qr-menu.ma/ma/tarifs). Local strengths include MAD pricing, QR codes, editable menus, multilingual presentation, WhatsApp support and onboarding for non-technical owners.
- **Gomenu** — [official site](https://gomenu.ma/). Positions around direct ordering, QR menus, pickup/delivery/table orders and a fixed subscription rather than a commission on sales.
- **tacMenu** — [official site](https://www.tacmenu.com/). Brings menu, live orders, POS, kitchen tickets, table QR codes and WhatsApp into one restaurant-focused experience.
- **QResto Pro** — [official site](https://www.qresto.pro/). Competes on a graduated stack from POS and QR menus to table management, delivery, food cost, kitchen display and marketing.
- **Lucide Menu** — [official site](https://lucide.ma/solutions/menu-digital). Highlights custom visual menus, photos, QR codes, French/Arabic/English, WhatsApp orders and operational dashboards.

## Product implications for Dollareus

1. **Make the first 15 minutes successful.** A new owner should be able to name the business, set currency and contact details, add a first product/dish, publish, and open the public link without understanding JSON, slugs, API terminology or deployment.
2. **Treat the public menu as a sales surface, not a PDF replacement.** Prioritize phone-first layout, readable categories, square dish photos, clear prices, availability, dietary/allergen details, stable QR URLs and easy WhatsApp contact. Any order placed through WhatsApp must be clearly described as a conversation/request unless a real order workflow records it in Dollareus.
3. **Keep menu editing low-friction.** Add/edit/archive dishes and categories, change prices, reorder menus, mark items unavailable and publish changes with immediate, understandable feedback.
4. **Keep POS and catalog connected.** Reuse the same products/menu items and server-validated prices; keep payment recording explicitly manual until a payment provider is implemented. Receipts must be printable and stock changes must leave an auditable movement record.
5. **Model inventory by location.** Show on-hand, reserved and available quantities where supported; make the selected POS location visible; do not imply that stock is shared across branches unless the backend actually aggregates it.
6. **Design for Moroccan and international customers.** Support MAD by default, international phone formats, Arabic/French/English, and readable right-to-left layouts. Avoid hard-coding English number/date presentation where the store locale is known.
7. **Do not imitate enterprise complexity too early.** Advanced kitchen display, table plans, loyalty, delivery routing, payroll and integrations should be deliberate follow-on capabilities. First make the core merchant workflow dependable and understandable.
8. **Earn trust with transparent scope.** Clearly distinguish implemented features from planned ones. Do not claim offline POS, online payment processing, automatic ordering, backups or verified production operations until those capabilities are actually implemented and checked.

## Prioritized experience backlog

### P0 — finish the usable core
- Complete browser-based owner journey: account → default business/location → menu/catalog → publish → public URL.
- Complete restaurant journey: categories → dishes/modifiers → publish → POS ticket → manual payment record → printable receipt.
- Confirm location-specific inventory adjustments and POS stock deductions are understandable and traceable.
- Add clear empty, loading, saved, error and unavailable states; keep mobile forms comfortable to use.

### P1 — improve conversion and everyday usability
- Public menu: WhatsApp contact inquiry is implemented from the configured business number with a prefilled message, and the latest CI/browser acceptance run passes. Keep the action explicitly described as a WhatsApp conversation, not an in-app order. Next: audit no-menu/no-items states, category navigation, shareability and mobile performance.
- Locale-aware currency formatting and Arabic right-to-left direction are implemented on the public restaurant menu and included in the latest passing CI run. A broader French/English/Arabic layout audit remains.
- Better low-stock visibility, quick counts, and multi-location context.
- Public page completeness: contact, hours, map, SEO metadata and consistent profile/menu/catalog links.

### P2 — only after the core is reliable
- Real order intake and status tracking rather than WhatsApp-only requests.
- Kitchen display / kitchen ticket routing, table plans and delivery zones.
- Bulk import/export, deeper sales analytics, loyalty and third-party integrations.
- Payment-provider integrations, offline mode and operational automation with explicit security/recovery testing.

## Benchmark takeaways from primary sources

- Square's item modifier guidance supports required/optional selections, price deltas, per-item ordering, and visibility by sales channel. Dollareus should preserve the same principle: customization rules belong to the item workflow and must remain legible on tickets and receipts. Source: [Square modifier management](https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers) and [Square multi-channel menus](https://squareup.com/help/gb/en/article/8553-manage-your-menus-across-locations-and-sales-channels).
- Toast documents a broad restaurant operations surface and explicitly describes offline-mode limitations. Dollareus should not claim offline operation until it exists and is verified; for now, keep manual payment records distinct from payment processing. Sources: [Toast restaurant POS](https://pos.toasttab.com/restaurant-pos) and [Toast offline mode](https://support.toasttab.com/en/article/Using-Toast-in-Offline-Mode).
- Shopify's multi-location guidance tracks stock independently by location and ties POS inventory to the selected location. Dollareus should keep location context visible and avoid suggesting branch stock is pooled. Sources: [Shopify multi-location inventory](https://help.shopify.com/en/manual/inventory-and-locations/setup/multi-managed-inventory) and [Shopify POS inventory](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/inventory-management/products).
- Local Moroccan digital-menu vendors emphasize QR access, multilingual menus, MAD pricing, and WhatsApp as a low-friction customer contact path. These are important local-market expectations, but individual feature claims should be reconfirmed before positioning or pricing.

## Verification rule

Code and isolated CI can verify builds, rendering, API contracts and simulated browser flows. They cannot prove the configured live database, object storage, backups, DNS, email/OAuth providers or production recovery procedures work. Those remain separate release gates and must not be represented as passed merely because the application build succeeds.
