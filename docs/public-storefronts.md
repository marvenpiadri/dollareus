# Public storefronts

Dollareus uses a business username plus a location address for public pages. A display name is not an identifier: multiple businesses can be called “KFC”, while each business username is globally unique and each location has its own path.

## URL structure

- Store profile: `/{username}/{location-slug}`
- Restaurant/café menu: `/{username}/{location-slug}/menu`
- Product catalog: `/{username}/{location-slug}/products`
- Category page: `/{username}/{location-slug}/products/category/{category-slug}`
- Product page: `/{username}/{location-slug}/products/{product-slug}`
- Service businesses currently use a contact-first public profile. A booking/quotation workflow is intentionally not assumed yet.

For example, one business may publish `/kfcllcc/kfc-casablanca-maarif` and `/kfcllcc/kfc-rabat-agdal`. The username is stored on the organization and copied to each store location; changing it from a location's storefront settings updates the organization's public username across its locations. Location slugs remain independent.

## Publishing and public data

The page is publicly accessible only when the location is active and its storefront is published. Public APIs expose only active products, published categories, active menus/items and images belonging to published stores. Internal workspace and POS endpoints remain authenticated.

Storefront settings include:
- Username and location URL
- Public description, SEO title and description
- Location display name, street address, city, country code, phone, website and Google Maps link
- Enabled experiences and the main profile action
- Guest Wi-Fi network, security and password

Guest Wi-Fi credentials are intentionally visible on the public menu and included in its Wi-Fi QR code. Configure a guest network, never a private business network.

## SEO

The profile and menu set page titles, meta descriptions, Open Graph metadata and index/noindex behavior. Store profiles emit Schema.org LocalBusiness data; product and catalog pages emit Product/ItemList data. Product and category paths are stable and individually addressable.

For server-rendered pages to fetch public API data during SSR, configure `DOLLAREUS_API_URL` as the absolute API origin in the frontend server environment. Configure `PUBLIC_STOREFRONT_BASE_URL` for absolute public URLs returned to QR entry points; `PUBLIC_STORE_DOMAIN` is the fallback public domain. If no public base URL is configured, the QR workspace falls back to the current frontend origin.

The current implementation does not yet include an automatically generated XML sitemap, Google Business Profile verification, or a dedicated booking workflow for services.
