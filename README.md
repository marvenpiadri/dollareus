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
- `apps/api`: Fastify API with Firebase Admin integration.
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

Copy `.env.example` to `.env` and configure Firebase Auth/emulators plus a development-only Neon `DATABASE_URL` when testing PostgreSQL migrations. Run `pnpm db:migrate` to apply versioned SQL migrations. Never commit real credentials. The initial commerce schema is in `apps/api/db/migrations`; the existing product routes still use Firestore until the API data-access migration is completed. The dashboard currently uses sample data and is not connected to the API yet. The API now has an initial store-creation/publishing and public-catalog foundation; the complete merchant workflow, public storefront renderer, stable QR-entry-point management, and Mageus channel authorization are still to be built. Protected API routes require a valid Firebase ID token and an active membership record.

## Product images

Image bytes belong in Firebase Cloud Storage (or a compatible object store), not Git or JSON. Product JSON stores a key such as `organizations/{organizationId}/products/{productId}/{assetId}/original.webp`, plus alt text, dimensions, and ordering. See [media storage](docs/architecture/media-storage.md) and [the product schema](schemas/product.schema.json).

## Current status

Early foundation, not production-ready. Authentication UI, organization onboarding, role management, production storage validation/image processing, payments, taxes, complete order processing, observability, and full test coverage remain to be implemented. Review [the first milestones](docs/product/first-milestones.md) and the [smart-commerce architecture](docs/architecture/smart-commerce.md).
