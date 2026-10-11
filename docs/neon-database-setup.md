# Set up the Dollareus Neon database

This guide covers a first install and subsequent schema upgrades. You do **not** need to create Dollareus tables one by one: the repository contains ordered SQL migrations and a command that applies them in order.

> **Important:** use a dedicated, empty database for the first install. The migration runner refuses to initialize history over an existing non-empty schema it cannot identify. For an existing database without `schema_migrations`, stop and plan a reviewed baseline migration; do not drop tables or retry blindly.

## 1. Create or choose an empty Neon database

1. Open the [Neon Console](https://console.neon.tech/) and choose your project.
2. Create a separate database for Dollareus (and separate staging and production databases when preparing a launch). If you are unsure whether the current database is empty, create a new dedicated database rather than guessing.
3. Open that database's **Connect** panel and copy its PostgreSQL connection string. Use the Node.js connection-string option if Neon offers one.
4. Keep the connection string private. It contains credentials. Do not put it in Angular code, commit it to Git, or paste it into public issues or chats.

For the first setup, a dedicated database in a dedicated Neon project is also a reasonable choice if that is simpler to manage.

## 2. Configure the local environment

From the repository root, copy the example file:

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux**
```bash
cp .env.example .env
```

Open `.env` in your editor and set `DATABASE_URL` to the connection string copied from Neon. Keep the other secrets empty unless you are configuring those features now. Do not commit `.env`.

The repository's API and database setup scripts load this root `.env` file. Node.js 22.22.3 or newer is required.

## 3. Install dependencies and create the schema

Run these commands from the repository root:

```bash
pnpm install
pnpm db:status
pnpm db:migrate
```

`pnpm db:status` is read-only: it reports whether migration history exists, which migrations are pending, and whether applied migration checksums match the repository. It does not print connection credentials. The migration runner applies files in `apps/api/db/migrations/` in filename order and records each applied migration and SHA-256 checksum in `public.schema_migrations`. Each migration and its history record are committed in the same transaction. A PostgreSQL advisory lock prevents two deployments from applying migrations concurrently. `pnpm db:setup` is retained as an alias for `pnpm db:migrate`.

## 4. Verify the tables in Neon

In the Neon SQL Editor, select the same database you used in `.env` and run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

You should see Dollareus tables, including `users`, `organizations`, `stores`, `products`, `pos_orders`, `pos_sessions`, `menus`, and `menu_items`. The complete list depends on the current schema; compare it with `apps/api/db/schema.sql` rather than relying only on this short sample.

To check indexes too, run:

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## 5. Check that the API can connect

With `DATABASE_URL` configured, start the API in a terminal:

```bash
pnpm api:dev
```

Then open [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health). A healthy response should report `data.status = "ok"` and `data.checks.database = "ok"`. Keep the API terminal open while testing. Start the Angular app in a second terminal with `pnpm start`.

If the API reports a connection error, check that the URL belongs to the same Neon database you inspected, that its password is current, and that the URL includes Neon's required SSL setting. Never solve a connection error by exposing the database URL to the browser.

## 6. Before production

- Use separate Neon databases for staging and production.
- Store production `DATABASE_URL` only in the API host's server-side environment/secret settings.
- Confirm backups/retention and test a restore before accepting real business data.
- Run `pnpm db:migrate` as a controlled deployment step before releasing API code that depends on a new schema.
- Never edit a migration that has already been applied; create the next numbered SQL file.
- Back up production data before migrations that alter or remove columns, indexes, or constraints.
- Verify the deployed API health endpoint and run a small staging workflow.
- Do not treat query/connection spikes in Neon as proof that the full schema or application workflows are correct.

## If you already created tables

Do not initialize migrations against that database automatically. Dollareus now has a versioned migration runner, but an existing database with tables and no `schema_migrations` history must be inspected and deliberately baselined first. Preserve the data and plan a reviewed migration before changing the schema.
