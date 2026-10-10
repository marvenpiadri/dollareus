# PostgreSQL database setup

Dollareus uses PostgreSQL (Neon in hosted environments) as its canonical database for accounts, organizations, stores, catalogs, and commerce data. First-party user credentials, OAuth links, email tokens, and sessions are stored in PostgreSQL. Firebase Authentication, Firestore, and Firebase Storage are not part of the current architecture.

## Fresh database setup

1. Create an empty PostgreSQL database or Neon branch for the environment.
2. Set the server-side `DATABASE_URL` for that database.
3. Run `pnpm db:setup`.
4. Verify the tables and indexes in the database provider console.

The setup script reads `apps/api/db/schema.sql` and refuses to run if the `public` schema already contains base tables. It is a fresh-install script, not an incremental migration runner. Do not run it against a database containing data you need to preserve.

## Schema policy

- The current schema is defined in `schema.sql`.
- Do not reintroduce an old migration runner or apply legacy Firestore migration instructions.
- Make future schema changes deliberately and document how they are applied safely to existing environments before deploying them.
- Never commit database credentials or expose `DATABASE_URL` to frontend code.
- Use separate development and production databases/branches. Back up production before schema changes and verify restore procedures.

## Data boundaries

Product image bytes belong in object storage, not PostgreSQL rows or JSON. Store only object keys and verified metadata in PostgreSQL once the object-storage implementation is selected and implemented. Media uploads are not currently implemented in the PostgreSQL-backed API.

## Current limitations

The current API covers basic first-party authentication, organization onboarding/listing, store creation/listing, product creation/listing, and public reads of published stores/catalogs. It does not yet implement full category, product editing/publishing, media, inventory, customer, cart, order, payment, fulfillment, POS, restaurant menu, QR, custom-domain, or integration workflows. See [launch readiness](../../../docs/launch-readiness.md).
