# Modular Business Engine

## Decision

Dollareus models a business as a public identity plus a configurable set of capabilities and offerings. It is not a restaurant application, retail application, or rental application. Those are business categories and optional capability combinations built on the same engine.

Dollareus remains independently useful and owns the operational source of truth. Mageus consumes the same APIs and can compose richer publishing, discovery, social, and commerce experiences around business profiles. Neither application should require the other to function.

## Domain vocabulary

- **Business**: the public identity/profile managed by an organization. It has a stable internal ID, a unique public username/handle, name, biography, logo, cover, contact methods, primary and optional secondary categories, languages, timezone, publication state, SEO fields, and optional locations.
- **Organization**: the owner and security boundary. A person can belong to multiple organizations; an organization can manage multiple businesses; team access is granted through organization/business permissions.
- **Location**: an optional physical branch or service area attached to a business. A business can operate online-only or at many locations. Locations hold addresses, coordinates, local hours, exceptions, contact information, and location-specific offering availability.
- **Offering**: the shared catalog concept for something a business sells, serves, rents, books, or otherwise provides. Avoid separate parallel catalog systems for restaurant menu items and retail products.
- **Category/collection**: an owner-managed grouping of offerings such as Food, Drinks, Products, Gaming, Rentals, or Services. These are organizational labels, not hard-coded offering types.
- **Capability**: a module the business enables, such as catalog, modifiers, inventory, POS, reservations, appointment scheduling, rentals, resources, delivery, or customer management.
- **Transaction/booking**: a durable operational record created from a customer enquiry, WhatsApp handoff, POS action, or future channel. External payment is not required to create or manage the record.

## Business profile as a composable page

Every published business has a fast, crawlable, mobile-first public page. The shared profile shell can render identity, media, description, contact links, working hours, locations, map, categories, reviews, and offerings. Business category and enabled capabilities select defaults and optional sections; they do not lock the business into a single layout.

A restaurant may emphasize food categories and item modifiers. A gaming café may present food, retail products, hourly gaming sessions, and room rental on one profile. A car-rental business may emphasize vehicle cards, dates, and pickup locations. These are different presentations over shared records and reusable components, not separate applications.

Storefront composition should be data-driven and owner-configurable. Prefer reusable page sections and typed configuration over hard-coded page variants. Configuration must be validated and versioned; it must not become an unbounded JSON dumping ground or replace relational data for important operational fields.

## Shared offering model and specialized modules

The common offering foundation should support:
- title, public handle, description, status, media, categories, sort order;
- pricing and currency, optional price units, tax treatment where applicable;
- channel and location availability, publication state, and SEO metadata;
- offering mode/capabilities such as purchase, serving, booking, rental, or enquiry;
- optional variants/options, quantities, lead time, and customer-facing call to action.

Use specialized relational records for genuinely specialized information: food modifiers/allergens, inventory and stock movements, bookable resources and time slots, vehicle specifications, rental terms, property details, service duration, and similar domain concepts. Do not force these fields into one giant table of nullable columns. Do not use JSON as the merchant's data-entry interface.

The first implementation should preserve the existing PostgreSQL migration discipline: applied migrations are immutable, every schema change gets a new ordered migration, and `apps/api/db/schema.sql` remains aligned with the migration chain. Refactor existing store/product concepts incrementally behind stable API contracts instead of renaming tables casually and breaking every current workflow at once.

## Public identity and URLs

- Use a required, unique, normalized public username for the owner/profile namespace, checked by a debounced availability endpoint during registration and editing.
- Public routes should use human-readable handles, never expose database IDs as the primary identity.
- A business may have a business-level page and optional location-specific pages. Location routes represent branches of the same business, not separate businesses by default.
- Reserve platform/system names, validate normalization consistently on server and client, and design handle changes with redirects/canonical URLs.
- Keep ownership and permissions attached to organization/business IDs, never inferred from the URL handle.

## Headless API and channels

Dollareus owns business identity, catalogs, prices, availability, inventory, bookings, customers, transactions, and audit history. It exposes versioned, authorization-scoped APIs and later webhooks. Dollareus's own dashboard and public pages are clients of those APIs; Mageus and external websites are clients too. Public reads must expose only published, safe fields. Writes require authentication, organization membership, and resource-level authorization.

WhatsApp can be a default conversion channel without becoming the data model: generate a safe, URL-encoded prefilled message from the selected offering/options/quantity/date/location, then record the enquiry or confirmed transaction in Dollareus when the business manages it. Do not represent an unconfirmed WhatsApp handoff as a paid order.

## SEO, structured data, and rich profiles

Public pages need server-rendered or otherwise crawlable content, unique title and description, canonical URLs, social preview metadata, indexation controls, sitemap entries, image alt text, and fast responsive media. Emit structured data based on the actual business category and published data—for example, an appropriate LocalBusiness subtype where applicable, plus Product, Service, Offer, openingHoursSpecification, and address data only when truthful and supported. Do not emit invented ratings, availability, prices, or review counts. Location pages should have location-specific details and canonical behavior that avoids duplicate thin pages.

## Maps

Use Google Maps Embed API for a simple map on public profiles when a business has a real address or coordinates. Google's current documentation states that Embed API usage is available at no charge with unlimited requests, but still requires a Google Cloud project, an API key, and billing enabled. Restrict the key by website/referrer and API; never ship server secrets to the browser. Use plain Google Maps directions links as a lightweight fallback. Treat geocoding, Places autocomplete/search, route computation, and other Maps Platform products as separate services with their own pricing/quotas; do not assume all Google Maps APIs are unlimited or free.

Store the business's address and coordinates as Dollareus data. An embedded map is a presentation, not the source of truth. Google Business Profile is a useful reference for the shape of location data (categories, address, phone, website, regular/special hours, service area, profile, and services), but its API is for managing listings on Google Search and Maps. Dollareus is building its own first-party business pages; Google Business Profile integration may be an optional future connector and must not be a dependency for creating a business.

## Security and privacy

Public profile endpoints must not leak private email addresses, customer notes, internal inventory, credentials, unpublished content, or moderation metadata. Business handles are public identifiers, not authorization. Apply rate limits and audit privileged changes. Keep public reviews, customer records, and operational transactions separate with clear consent and retention policies.

## Implementation sequence

1. Audit existing tables/routes/UI against this model; identify compatibility boundaries before changing schemas.
2. Make business identity and public username first-class, including server-side normalization, uniqueness, availability endpoint, and debounced UI validation.
3. Build the shared business profile editor and public profile renderer with hours, contacts, media, locations, SEO, and optional map.
4. Consolidate offerings and owner-managed categories across restaurant/menu and retail use cases; preserve typed options and specialized tables.
5. Wire public offering actions into WhatsApp enquiries and durable internal records.
6. Add optional capabilities incrementally: POS, inventory, modifiers, bookings/resources, rentals, properties, and other modules.
7. Make Mageus consume the stable APIs and render the same business/offering data in its own page composition.
8. Verify production build, migration parity, API smoke tests, authorization boundaries, SSR metadata, and public page behavior before declaring a phase complete.

## Reference documentation

- [Google Business Profile APIs](https://developers.google.com/my-business)
- [Google Business Profile location resource](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations)
- [Google Maps Embed API quickstart](https://developers.google.com/maps/documentation/embed/quickstart)
- [Google Maps Embed API usage and billing](https://developers.google.com/maps/documentation/embed/usage-and-billing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
