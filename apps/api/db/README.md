# PostgreSQL database workflow

Dollareus uses PostgreSQL for accounts, organizations, stores, catalogs, and commerce data. First-party password credentials, OAuth account links, email tokens, and sessions are stored in PostgreSQL. Firebase Authentication, Firestore, Firebase Storage, and Drizzle ORM are not part of this architecture.

## Canonical schema and migrations

- **Canonical change history:** ordered SQL files in `apps/api/db/migrations/`.
- **Migration runner:** `pnpm db:setup` applies unapplied migrations and records checksums in `schema_migrations`.
- **Migration verification:** `pnpm db:status` checks recorded migrations and checksums.
- **Schema snapshot:** `apps/api/db/schema.sql` is a checked snapshot for clean installs, review, and drift detection; do not use it as a second migration history.
- **Schema contract check:** `pnpm db:schema-check` compares the migrated PostgreSQL column definitions with the snapshot.

Applied migration files must not be edited. Add a new numbered SQL migration for changes to an existing database. Review every migration against both a fresh PostgreSQL database and a copy of the current schema before deployment.

## Connecting an environment

1. Create a PostgreSQL database or a dedicated Neon/Cloud SQL database.
2. Configure the API's server-side `DATABASE_URL` or supported `SQL_*` connection settings.
3. Back up any database containing valuable data before applying migrations.
4. Run `pnpm db:setup`, then `pnpm db:status` and `pnpm db:schema-check`.
5. Never commit credentials or expose database connection secrets to frontend code. Use separate development and production databases.

The migration runner refuses to adopt an existing schema without migration history unless an explicit baseline is requested. Do not use baseline mode casually: inspect the live schema and agree on the baseline before adopting an existing database.

## Data boundaries and limitations

Product image bytes belong in object storage, not PostgreSQL rows or JSON. Store object keys and verified metadata in PostgreSQL once an object-storage implementation is selected and implemented. Media uploads are not currently implemented in the PostgreSQL-backed API.

The API's actual implemented endpoints, rather than the presence of tables, define the available product functionality. Review the API routes and [launch readiness](../../../docs/launch-readiness.md) before claiming any module is production-ready.
