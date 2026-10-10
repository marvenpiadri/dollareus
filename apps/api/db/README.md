# PostgreSQL database setup

Dollareus uses Neon PostgreSQL as the canonical store for commerce data. Firebase Authentication remains the identity provider; the Firebase UID is stored as text in `organization_memberships.user_id`. Product media files live in object storage; PostgreSQL stores their storage key and metadata only.

## Migration policy

- Migrations are ordered, immutable SQL files under `apps/api/db/migrations`.
- Apply them only with the migration runner and a server-side `DATABASE_URL`.
- The runner must take a PostgreSQL advisory lock, run each unapplied migration in a transaction, and record the version in `schema_migrations`.
- Never put production credentials in source control, frontend environment variables, logs, or issue comments.
- Back up production before schema changes and test migrations against a disposable Neon branch first.
- A schema migration creates tables; it does not automatically migrate existing Firestore documents. The API currently still uses Firestore for products and membership until the application migration is implemented and tested.

## Connection

Use Neon’s pooled connection string for serverless runtime traffic, with TLS enabled. Keep it in Vercel server-side environment variables as `DATABASE_URL`; never prefix it with `NG_APP_` or expose it to Angular. Use a separate development database/branch for local work.

## Scope of migration 0001

Organizations and memberships, stores, products and variants, product-media metadata, inventory, customers and addresses, carts, orders and immutable order-item snapshots, payments, fulfillments, audit events, and migration tracking.
