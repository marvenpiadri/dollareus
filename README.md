# Dollareus

**An API-first commerce platform for independent businesses.**

Dollareus is being built as a standalone commerce engine that powers its own merchant workspace and integrates deeply with Mageus. It aims to serve retailers, restaurants, freelancers, creators, and service businesses without forcing them into one rigid workflow.

## Product principles

- **API-first:** Dollareus serves its own interfaces and authorized external clients such as Mageus through stable, versioned APIs.
- **One source of truth, many experiences:** a store owns its catalog; menus, storefronts, Mageus pages, QR links, and external clients are presentations or channels over the same records.
- **Modular by business need:** commerce fundamentals are shared; restaurant, retail, services, and digital-goods capabilities are optional modules.
- **One source of truth:** catalogs, orders, inventory, and fulfillment have explicit ownership.
- **Secure by default:** organizations are isolated; access is authenticated, authorized, audited, and validated on the server.
- **Media is not JSON:** product images live in object storage. JSON records store storage keys and image metadata, not base64 files.
- **International by design:** model currency, locale, timezone, tax treatment, addresses, and payment methods explicitly for Morocco, France, and the United States.
- **Build carefully:** prioritize reliable domain models and core commerce workflows before expanding into every feature of a large commerce suite.

## Product boundaries

- **Dollareus Commerce Core:** stores, catalogs, products, variants, carts, orders, checkout, and fulfillment.
- **Business modules:** inventory, purchasing, POS, CRM, restaurant service, appointments, and digital products.
- **Shared engines:** QR generation/management and integration with the X-Facture document engine.
- **Mageus and external integrations:** authorized APIs render Dollareus-owned catalogs in Mageus and future apps without copying the source records; Mageus remains focused on publishing, communities, audience, and discovery.

## Repository structure

- `apps/merchant`: Angular merchant dashboard.
- `apps/api`: Fastify API backed by PostgreSQL, with first-party authentication.
- `packages/contracts`: shared TypeScript transport contracts.
- `schemas`: JSON Schemas for API/domain records.
- `docs/architecture`: architecture, API and media-storage decisions.

## Local development

Requirements: Node.js 20.19+ and pnpm 10.

```bash
pnpm install
pnpm start       # Angular dashboard: http://localhost:4200
pnpm api:dev     # API: http://localhost:3000
pnpm build
pnpm api:typecheck
pnpm ci
```

Copy `.env.example` to `.env` and configure `DATABASE_URL` for Neon PostgreSQL. Run `pnpm db:setup` once against an empty database to create the fresh schema in `apps/api/db/schema.sql`. The setup script refuses to run if the public schema already contains tables. There is no Firebase dependency, Firestore data migration, or versioned migration runner. Dollareus owns password credentials, OAuth account links, email verification, password recovery, and sessions in PostgreSQL. Email flows use a Resend-compatible API and require `AUTH_EMAIL_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_PUBLIC_URL`. Object-storage upload routes are not yet reimplemented. Never commit credentials. The merchant sign-in/register UI is connected to first-party auth endpoints. The dashboard now loads organizations, stores, and products from the API, supports first-run organization/store creation, and can create draft products. Order listing and creation, inventory tracking, customer records, restaurant menus, QR entry points, order-status auditing, and manual/offline payment tracking are implemented at the API level. The merchant UI exposes order status and offline payment tracking; full fulfillment/shipping, refunds, POS checkout, sales analytics, media uploads, and product publishing remain incomplete. The PostgreSQL reset is underway. API coverage includes organization/store/product workflows, category/customer/inventory APIs, orders, restaurant menus, QR/direct-link entry points, and manual/offline payment tracking. POS, domain, media, fulfillment/shipping, refunds, and some storefront workflows remain to be implemented against PostgreSQL. Track progress in [the PostgreSQL reset status](docs/architecture/postgresql-reset-status.md) and review the [pre-launch readiness checklist](docs/launch-readiness.md). Protected API routes require a valid Dollareus session and an active organization membership stored in PostgreSQL.

## Product images

Image bytes belong in object storage, not PostgreSQL rows or JSON. Product JSON stores a key such as `organizations/{organizationId}/products/{productId}/{assetId}/original.webp`, plus alt text, dimensions, and ordering. See [media storage](docs/architecture/media-storage.md), [the product schema](schemas/product.schema.json), and [hosted storefront domains](docs/architecture/storefront-domains.md).

## Current status

Early foundation, not production-ready. Authentication endpoints and merchant auth screens are implemented but have not been build-verified or exercised against a live database and real OAuth/email provider configuration. The PostgreSQL API cutover and endpoint parity, role management, media upload verification, online payment processing (intentionally deferred), refunds, fulfillment/shipping, taxes, observability, and full test coverage remain to be implemented. Review [the first milestones](docs/product/first-milestones.md) and the [smart-commerce architecture](docs/architecture/smart-commerce.md).
