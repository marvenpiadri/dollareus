# Dollareus

**An API-first commerce platform for independent businesses.**

Dollareus is an API-first business operating system for retailers, restaurants, freelancers, creators, and service businesses. It owns operational data and workflows—catalogs, inventory, POS, customers, orders, payments, reservations, and fulfillment—and exposes those capabilities through a stable API. Mageus is the default customer-facing storefront, publishing, and discovery layer; Dollareus is not being developed as a competing public storefront.

## Product principles

- **API-first:** Dollareus serves its own interfaces and authorized external clients such as Mageus through stable, versioned APIs.
- **One source of truth, many experiences:** a store owns its catalog; Mageus storefronts, QR links, and external client apps are presentations or channels over the same records.
- **Modular by business need:** commerce fundamentals are shared; restaurant, retail, services, and digital-goods capabilities are optional modules.
- **One source of truth:** Dollareus owns commerce records; Mageus and external applications consume authorized API projections rather than duplicating business data.
- **API as a product:** external developers and client businesses can pay to use scoped Dollareus APIs to power their own branded websites and apps.
- **Shared identity:** a person can use the same Dollareus identity across Dollareus and Mageus. Cross-domain sign-in will use a proper shared identity/OIDC flow, not shared passwords or an insecure cross-domain cookie.
- **Guest-friendly customer experience:** customers can buy or book through Mageus without being forced to create an account; an optional customer profile can unify their eligible activity across the ecosystem.
- **Secure by default:** organizations are isolated; access is authenticated, authorized, audited, and validated on the server.
- **Media is not JSON:** product images live in object storage. JSON records store storage keys and image metadata, not base64 files.
- **International by design:** model currency, locale, timezone, tax treatment, addresses, and payment methods explicitly for Morocco, France, and the United States.
- **Build carefully:** prioritize reliable domain models and core commerce workflows before expanding into every feature of a large commerce suite.

## Product boundaries

- **Dollareus business engine:** organizations, products, variants, menus, inventory, POS, customers/CRM, orders, offline payment records, reservations, fulfillment, and audit history.
- **Dollareus developer platform:** versioned APIs, scoped app credentials, webhooks, usage metering, documentation, and paid API plans. These capabilities are a product, not an internal implementation detail.
- **Mageus storefront and discovery:** Mageus owns public storefronts, publishing, magazines, communities, audience-building, product/service discovery, and customer-facing buying and booking experiences.
- **External applications:** a coffee app, restaurant website, booking app, or custom client site can use Dollareus APIs while keeping its own brand and frontend.
- **Shared engines:** QR generation/management and integration with the X-Facture document engine.

## Repository structure

- `src/`: the complete Angular 22 frontend, organized into `app/core`, `app/features`, and `app/shared`, including browser/server bootstrap and SSR entry files.
- `apps/api`: Fastify API backed by PostgreSQL, with first-party authentication.
- `packages/contracts`: shared TypeScript transport contracts.
- `schemas`: JSON Schemas for API/domain records.
- `docs/architecture`: architecture, API and media-storage decisions.

## Deployment and readiness

- [Production deployment checklist](docs/deployment/production-checklist.md)
- [Launch readiness and outstanding blockers](docs/launch-readiness.md)
- [Developer API credential guide](docs/api/developer-credentials.md)

## Local development

Requirements: Node.js 22.22.3+ and pnpm 10.

```bash
pnpm install
pnpm start       # Angular 22 app with SSR dev integration: http://localhost:4200
pnpm build       # Browser + server production build
pnpm serve:ssr   # Run the production SSR server after building
pnpm api:dev     # API: http://localhost:3000
pnpm build
pnpm api:typecheck # Type-check the API
pnpm ci
```

Copy `.env.example` to `.env` and configure `DATABASE_URL` for Neon PostgreSQL. Run `pnpm db:setup` once against an empty database to create the fresh schema in `apps/api/db/schema.sql`. The setup script refuses to run if the public schema already contains tables. There is no Firebase dependency, Firestore data migration, or versioned migration runner. Dollareus owns password credentials, OAuth account links, email verification, password recovery, and sessions in PostgreSQL. Email flows use a Resend-compatible API and require `AUTH_EMAIL_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_PUBLIC_URL`. Product images are converted to WebP in the browser and optimized toward 1 MiB; the API rejects any uploaded image above 4,096 KB and uses Sharp in Node.js to generate cached responsive variants for allowlisted widths such as `?width=300`. Images remain in private Neon S3-compatible object storage. Configure the API's AWS S3 environment variables and verify a real bucket upload/read/resize round-trip before production. Never commit credentials. The merchant sign-in/register UI is connected to first-party auth endpoints. The dashboard loads organizations, stores, products, orders, customers, and inventory from the API. The merchant UI supports order status updates and manual/offline payment tracking. The API now supports auditable manual refund records against successful offline payments, including partial refunds, per-payment amount guards, idempotency, and refund history; it does not initiate actual payment-provider refunds. Audited manual shipment tracking is now implemented in the API and merchant workspace, including carrier, tracking number/link, expected delivery, notes, delivery stages, and separation of delivery status from COD collection. Live Neon database and object-storage integration verification are still pending. Inline POS payment controls, inventory deduction, advanced product publishing, additional variant management, developer API credentials/usage plans/webhooks, and shared Mageus identity integration remain unfinished. Product image upload and private authenticated image retrieval are implemented but still need verification against the configured Neon bucket. The manual refund API and smoke coverage were added after the last verified CI run and need a fresh CI pass. Dollareus will not become the default public storefront; Mageus will provide the default storefront and customer-facing commerce experience. Track progress in [the PostgreSQL reset status](docs/architecture/postgresql-reset-status.md) and review the [pre-launch readiness checklist](docs/launch-readiness.md). Protected API routes require a valid Dollareus session and an active organization membership stored in PostgreSQL.

## Product images

Image bytes belong in object storage, not PostgreSQL rows or JSON. Product JSON stores a key such as `organizations/{organizationId}/products/{productId}/{assetId}/original.webp`, plus alt text, dimensions, and ordering. See [media storage](docs/architecture/media-storage.md), [the product schema](schemas/product.schema.json), and [hosted storefront domains](docs/architecture/storefront-domains.md).

## Current status

Early foundation, not production-ready. Authentication endpoints and merchant auth screens are implemented but have not been build-verified or exercised against a live database and real OAuth/email provider configuration. The PostgreSQL API and operational workflows still need CI/build verification, live database testing, role management, POS checkout, media uploads, refunds, taxes, observability, developer API access controls, and full test coverage. Online payment processing is intentionally deferred. Review [the first milestones](docs/product/first-milestones.md) and the [smart-commerce architecture](docs/architecture/smart-commerce.md).
