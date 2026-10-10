# Hosted storefront URLs and custom domains

## Canonical URL model

Each store has one canonical storefront identity and can have several hostnames attached to it.

- Default platform URL: `https://{store-slug}.{PUBLIC_STORE_DOMAIN}`, e.g. `https://cafe-atlas.dollareus.com`.
- Stable path fallback: `https://{PUBLIC_STORE_DOMAIN}/s/{store-slug}` (the public HTML renderer/router is still a separate implementation milestone).
- Merchant-owned custom domain: e.g. `https://shop.example.com`.

The store and catalog are not duplicated when a hostname is added. All hostnames resolve to the same organization/store ID. A primary hostname is canonical for SEO; other hostnames should redirect to it once the storefront router and redirect handling are implemented.

## Platform DNS and hosting requirements

Before promising live public storefronts, configure all of the following in the actual production hosting account:

1. Attach the Dollareus apex domain to the storefront hosting project.
2. Configure wildcard DNS for `*.dollareus.com` to the storefront host. The exact target depends on the selected hosting provider.
3. Confirm the host-based router can receive arbitrary store subdomains and resolve the hostname through Dollareus.
4. Provision TLS for wildcard subdomains.
5. Add server-rendered/crawlable storefront HTML, canonical metadata, sitemap, and redirects.

The API returns hosted URLs and includes host resolution plus a basic server-rendered HTML storefront. This repository change does not itself configure DNS, TLS, or a hosting project. Do not consider a URL live until those infrastructure steps are verified.

## Custom domain connection

The authenticated merchant API supports:

- `GET /api/v1/organizations/:organizationId/stores/:storeId/domains`
- `POST /api/v1/organizations/:organizationId/stores/:storeId/domains` with `{ "hostname": "shop.example.com" }`
- `POST /api/v1/organizations/:organizationId/stores/:storeId/domains/:hostname/verify`
- `GET /api/v1/public/resolve-host` — maps the incoming Host header to a published store.
- `GET /`, `GET /menu`, `GET /catalog`, `GET /services` — server-rendered public storefront routes when the request host maps to a published store.
- `GET /s/:storeSlug` and `GET /s/:storeSlug/:experience` — server-rendered fallback routes.
- `GET /robots.txt` and `GET /sitemap.xml` — basic crawl discovery.

The create response returns a unique TXT ownership-verification record and a CNAME target. The merchant must add the requested DNS records. The verification endpoint checks the TXT challenge; unverified hostnames are not added to the global host map. DNS ownership verification is not the same as attaching the domain to the hosting project—hosting configuration and TLS still need to be completed.

For apex domains, DNS providers may require ALIAS/ANAME or CNAME flattening instead of CNAME. Use the exact record instructions returned by the API and the hosting provider's current requirements.

## Data model and security

- `store_domains.hostname` is globally unique to prevent one hostname mapping to two stores.
- Every domain belongs to an organization and store.
- Platform subdomains are allocated transactionally at store creation.
- Custom domains are pending until a random TXT token proves control.
- Public host resolution returns only the published store projection.
- Never trust a `Host` header to authorize merchant actions; it is only a public storefront routing hint.
- Domain changes, activation and primary-domain changes should be audited. Add redirect and primary-domain mutation flows before production launch.
