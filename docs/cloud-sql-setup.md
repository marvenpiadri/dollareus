# Google Cloud SQL setup

Dollareus uses PostgreSQL directly through `pg`. It does not use Firebase Authentication, Firestore, or an ORM. Ordered SQL files in `apps/api/db/migrations/` are the only migration mechanism.

## Connection configuration

Set these variables in the deployment environment or your untracked local `.env` file:

- `SQL_HOST`: Cloud SQL private/public IP, a local Cloud SQL Auth Proxy host, or the Unix socket path supplied by the hosting platform.
- `SQL_PORT`: PostgreSQL port, normally `5432` for TCP. The default is `5432`.
- `SQL_DB_NAME`: the Dollareus database name.
- `SQL_USER` and `SQL_PASSWORD`: a dedicated least-privilege database user and password.
- `SQL_SSL=true`: enable PostgreSQL TLS when connecting directly over TCP and the instance requires TLS.
- `SQL_SSL_REJECT_UNAUTHORIZED=true`: verify the server certificate. Do not disable verification to work around certificate problems.
- `DATABASE_POOL_MAX`: optional pool size; default is `5`.

`DATABASE_URL` can be used instead of the `SQL_*` settings. If both are present, `DATABASE_URL` takes precedence. Never commit database credentials or paste them into source files.

## Before connecting a live database

1. Confirm the hosting service can reach the Cloud SQL instance through an approved network path. Prefer the Cloud SQL Auth Proxy/connector or private IP/VPC connectivity where available; do not expose PostgreSQL broadly to the public internet.
2. Confirm the database exists, the runtime user can connect, and it has only the privileges required by Dollareus migrations and application queries.
3. Take or verify a restorable backup before changing a database that contains real data.
4. Run `pnpm db:status` first. If the database already contains tables but has no migration ledger, stop and review it; do not use `DB_BASELINE=true` casually.
5. On a new empty database, run `pnpm db:migrate` once from a controlled deployment step, then run `pnpm db:status` again.
6. Run `pnpm db:schema-check` against a disposable test database after migrations. It compares the live column definitions with `apps/api/db/schema.sql`.
7. Run the API smoke suite and test registration, login, logout, workspace loading, product CRUD, and restaurant/POS flows against a non-production database.

## Migration rules

- Do not run `drizzle-kit push` or introduce a second schema-management tool.
- Never edit a migration that may already have been applied; add a new numbered SQL migration.
- `apps/api/db/schema.sql` is a checked reference snapshot, not a script to apply over an existing database.
- A green CI run verifies the migrations against CI's disposable PostgreSQL service. It does **not** prove the provisioned Cloud SQL instance is reachable or safe to modify.

## Object storage is separate

Cloud SQL stores relational business data; it is not file storage. Keep product images in the configured object-storage bucket and store only object keys and metadata in PostgreSQL. Verify the bucket configuration separately.
