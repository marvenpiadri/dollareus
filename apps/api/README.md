# Dollareus API

The API is a Fastify service backed by PostgreSQL and first-party Dollareus authentication. Firebase Authentication, Firestore, and Firebase Storage are not used by the current implementation.

## Local development

Requirements: Node.js 20.19+ and pnpm 10.

1. Copy `.env.example` to `.env` and configure a server-side `DATABASE_URL`.
2. Use an empty development PostgreSQL database and run `pnpm db:setup` to create the schema from `apps/api/db/schema.sql`.
3. Install dependencies with `pnpm install`.
4. Start the API with `pnpm api:dev`.
5. Start the Angular merchant workspace in another terminal with `pnpm start`.

The API health endpoint is `GET http://localhost:3000/api/v1/health`. Never expose `DATABASE_URL` to the browser.

## Authentication

Protected endpoints use the first-party Dollareus session cookie. Password registration requires email verification before password sign-in. Email verification and password-reset links require the configured email sender and `AUTH_PUBLIC_URL`. Google and Facebook OAuth require their respective client credentials and callback URLs to be configured in the deployment environment.

## Implemented commerce endpoints

- `POST /api/v1/organizations` — create an organization and make the signed-in user its owner.
- `GET /api/v1/organizations` — list organizations where the signed-in user has active membership.
- `POST /api/v1/organizations/:organizationId/stores` — create a store and its storefront configuration.
- `GET /api/v1/organizations/:organizationId/stores` — list stores in an organization.
- `GET /api/v1/organizations/:organizationId/products` — list products in an organization.
- `POST /api/v1/organizations/:organizationId/products` — create a product with variants.
- `PATCH /api/v1/organizations/:organizationId/products/:productId` — update product name, slug, description, and lifecycle status (including archive).
- `GET /api/v1/public/stores/:storeSlug` — read a published, active store.
- `GET /api/v1/public/stores/:storeSlug/catalog` — list active products and active variants for a published store.
- `GET /health` and `GET /api/v1/health` — health checks.

Protected organization routes verify active membership server-side. The API does not yet provide full role/permission management.

## Known gaps

The merchant workspace now loads organizations, stores, and products from the API and guides a signed-in user through initial organization/store creation. However, product create/edit/publish UI, categories, variants editing, media upload/storage, inventory, customers, carts, orders, payments, refunds, fulfillment, POS, restaurant menus, QR entry points, custom domains, and integration management remain incomplete or unimplemented. Sales analytics are not available until order/payment data and reporting endpoints exist.

Do not use this API for real commerce transactions until the relevant launch-readiness items have been implemented, configured, and tested end to end. See [the launch-readiness checklist](../../docs/launch-readiness.md).
