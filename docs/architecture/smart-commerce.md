# Smart commerce: one source of truth, many experiences

## Decision

Dollareus is the commerce system of record. Mageus and future first-party or third-party applications are channels/clients of that system. They must not maintain independent copies of a merchant's products, menu items, prices, or availability.

A business has one organization and one or more stores. A store owns its catalog and its public storefront configuration. Different experiences render the same underlying records according to the visitor's context.

## Keep these concepts separate

- **Business type** answers what kind of business this is: restaurant, retail, services, freelancer, digital, or general.
- **Catalog item kind** answers what is being offered: physical product, digital product, service, or food/drink item.
- **Experience** answers how the catalog is presented: commerce storefront, restaurant menu, general catalog, or service listing.
- **Channel** answers which application is using the data: Dollareus, Mageus, or an authorized external client.
- **Entry point** answers how a visitor arrives: public link, QR code, or embedded view.

These are orthogonal dimensions. Do not create a separate store type for QR, Mageus, restaurant menu, or external app integrations.

## Example: restaurant

1. A merchant creates a restaurant store in Dollareus.
2. They add menu items as catalog items, assign categories such as Coffee or Breakfast, set prices, images, availability, and publication state.
3. The store enables the 'menu' experience. That changes the public presentation; it does not create another menu database or a second store.
4. Dollareus issues a stable public entry point such as '/s/cafe-atlas/menu'. Its QR code encodes that URL.
5. Mageus connects to the same store through an authorized integration and renders the menu in the Mageus store page.
6. Updating and publishing an item in Dollareus changes the canonical catalog. Public Dollareus pages and Mageus refresh from the same source.

The QR code should not contain the menu data. It contains a stable URL, so menu changes do not require reprinting the code. If a store owner changes a slug, use a redirect or managed entry point rather than silently breaking printed QR codes.

## Example: product seller or service provider

A retail store uses the commerce experience to render products and variants. Mageus can showcase those same products inside its store UI. A service business uses the services experience to show service descriptions and prices, with booking capability added later. The source records remain owned by Dollareus.

## API shape

The public read API exposes a deliberately published projection, not raw merchant documents. The current feature branch implements the initial store/catalog/entry-point API foundation:

- POST /api/v1/organizations/:organizationId/stores and GET /api/v1/organizations/:organizationId/stores — create and list stores.
- PATCH /api/v1/organizations/:organizationId/stores/:storeId/storefront — configure experiences and publish/unpublish the public storefront.
- POST /api/v1/organizations/:organizationId/stores/:storeId/categories — create store-scoped catalog categories.
- GET /api/v1/public/stores/:storeSlug — public store identity and active storefront configuration.
- GET /api/v1/public/stores/:storeSlug/catalog — published categories and items.
- GET and POST /api/v1/organizations/:organizationId/stores/:storeId/entry-points — manage stable QR/link targets.
- PATCH /api/v1/organizations/:organizationId/stores/:storeId/entry-points/:entryPointId — enable or disable an entry point.
- GET /api/v1/public/entry-points/:entryPointId — resolve a stable entry-point ID to its canonical public path.

The QR code should encode the public app URL plus the returned /q/{entryPointId} path. The frontend /q/:entryPointId route and public HTML storefront renderer are not implemented yet; the API resolver returns the canonical path for that frontend route to follow. Mageus channel connection/token management and a dedicated experience-specific response endpoint are also future work.

Validate every path and query, enforce organization membership on private routes, and expose only published content on public routes. Public catalog image delivery URLs are not yet part of this implementation; public responses deliberately omit private object-storage keys.

## Mageus and external app authorization

An integration must be explicitly connected by a store owner. Use narrowly scoped credentials/tokens and server-side authorization. Scopes should distinguish public catalog reads from merchant management and order actions. Never put a merchant secret in browser code. Revoke access cleanly, record relevant audit events, and attribute orders to their originating channel.

Mageus may cache public data for performance, but Dollareus remains the source of truth. Use cache validators/revalidation and short freshness windows for volatile availability. Price and availability must be rechecked server-side at checkout; a stale public page must never be authoritative for an order total.

## Publishing and public discovery

Draft content must never leak through public endpoints. Publish state and timestamps should be explicit. Public pages should have stable canonical URLs, server-rendered or otherwise crawlable HTML, descriptive titles, canonical metadata, and sitemap support. QR access does not depend on search indexing. Search engines may choose whether and when to index a public page, so indexing cannot be guaranteed.

## Boundaries and future modules

The shared core owns stores, catalog identity, prices, media references, publication state, entry points, channels, and future orders. Optional modules add domain-specific behavior without forking the core:

- Restaurant: menu categories, availability windows, dietary/allergen labels, tables, ordering and kitchen workflows.
- Retail: inventory, variants, stock locations and point of sale.
- Services: service options, duration, scheduling and booking.
- Digital goods: delivery entitlements and downloads.

Only add a separate domain model when the business rules are genuinely different. Reuse common fields such as title, description, images, price and publication state rather than cloning whole store/catalog systems.

## Acceptance criteria

- Editing an item in Dollareus updates the public Dollareus experience and every connected channel after the documented refresh window.
- A QR code continues to work after menu item edits and price changes.
- Draft items and private merchant fields never appear in public projections.
- A Mageus integration cannot read or mutate another organization's private resources.
- Public catalog reads work without a customer account.
- The server recalculates authoritative prices and availability before creating an order.
- Disabling a channel or entry point takes effect without deleting the underlying catalog.
- Integration tests cover publish/unpublish, permissions, stale availability, slug changes, and channel revocation.
