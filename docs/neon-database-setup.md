# Set up the Dollareus Neon database

This guide is for a first-time setup. You do **not** need to create Dollareus tables one by one: the repository contains the schema and a setup command that creates the tables and indexes together.

> **Important:** use a dedicated, empty database for this first install. The current `pnpm db:setup` command is a fresh-install tool, not a migration system. It intentionally refuses to run if it finds any ordinary tables in the database's `public` schema. Never point it at a database that contains data you need to keep.

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
pnpm db:setup
```

The script reads `apps/api/db/schema.sql`, runs the schema inside a transaction, and prints the names of the tables it created. If it says the public schema is not empty, **stop**. Do not delete tables to make the command pass and do not retry against a database containing data. Confirm you selected the intended empty Dollareus database first.

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
- Run the schema setup only on the intended empty database.
- Verify the deployed API health endpoint and run a small staging workflow.
- Do not treat query/connection spikes in Neon as proof that the full schema or application workflows are correct.

## If you already created tables

Do not run `pnpm db:setup` against that database. Dollareus does not yet have a versioned migration runner for upgrading existing installations. Preserve the data, inspect which tables exist, and plan a reviewed migration before changing the schema.
