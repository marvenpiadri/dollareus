import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

type AppliedMigration = { name: string; checksum: string };

async function hasColumn(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

/**
 * Keep historical migration files/checksums immutable while allowing their
 * legacy data backfills to run against both the current schema and older
 * installations that used different price-column names.
 */
async function prepareMigrationSql(client: PoolClient, name: string, sourceSql: string): Promise<string> {
  let sql = sourceSql;

  if (name === '0012_fix_schema_discrepancies.sql' &&
      !(await hasColumn(client, 'product_variants', 'amount_minor'))) {
    sql = sql.replace(
      'UPDATE product_variants SET price_amount_minor = amount_minor WHERE price_amount_minor IS NULL;',
      ''
    );
  }

  if (name === '0014_fix_order_items_unit_amount_minor.sql' &&
      !(await hasColumn(client, 'order_items', 'price_amount_minor'))) {
    if (await hasColumn(client, 'order_items', 'amount_minor')) {
      sql = sql
        .replaceAll('price_amount_minor', 'amount_minor');
    } else if (await hasColumn(client, 'order_items', 'unit_amount_minor')) {
      sql = sql
        .replace(
          'UPDATE order_items SET unit_amount_minor = price_amount_minor WHERE unit_amount_minor IS NULL;',
          ''
        )
        .replace(
          'UPDATE order_items SET total_minor = price_amount_minor * quantity WHERE total_minor IS NULL;',
          'UPDATE order_items SET total_minor = unit_amount_minor * quantity WHERE total_minor IS NULL;'
        );
    } else {
      sql = sql
        .replace(
          'UPDATE order_items SET unit_amount_minor = price_amount_minor WHERE unit_amount_minor IS NULL;',
          ''
        )
        .replace(
          'UPDATE order_items SET total_minor = price_amount_minor * quantity WHERE total_minor IS NULL;',
          ''
        );
    }
  }

  return sql;
}


try {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('dollareus:schema-migrations'))");
    lockAcquired = true;

    const migrationTable = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );

    const isBaseline = process.argv.includes('--baseline') || process.env.DB_BASELINE === 'true';

    if (!migrationTable.rows[0]?.exists) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          name text PRIMARY KEY,
          checksum char(64) NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const existing = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != 'schema_migrations'`
      );

      const hasExistingTables = Number(existing.rows[0]?.count ?? 0) > 0;
      if (hasExistingTables && !isBaseline) {
        throw new Error(
          'The public schema already contains tables but has no schema_migrations history. Refusing to adopt or modify an existing database automatically. Review it and run with --baseline to establish a baseline migration deliberately.'
        );
      }
    }

    const files = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));

    for (const name of files) {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) {
        throw new Error(`Invalid migration filename "${name}". Use ####_lowercase_description.sql.`);
      }
    }

    const appliedResult = await client.query<AppliedMigration>(
      'SELECT name, checksum FROM public.schema_migrations'
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum.trim()]));
    let newlyApplied = 0;

    for (const name of files) {
      const sql = await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const executionSql = await prepareMigrationSql(client, name, sql);
      const existingChecksum = applied.get(name);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Applied migration "${name}" has changed. Create a new migration instead of editing an applied migration.`
          );
        }
        continue;
      }

      if (isBaseline) {
        await client.query(
          'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [name, checksum]
        );
        newlyApplied += 1;
        console.log(`[db:migrate] Baselined ${name}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(executionSql);
        await client.query(
          'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum]
        );
        await client.query('COMMIT');
        newlyApplied += 1;
        console.log(`[db:migrate] Applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    console.log(
      `[db:migrate] Complete. ${newlyApplied} migration(s) applied; ${applied.size + newlyApplied} recorded; ${tables.rowCount ?? 0} tables present.`
    );
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext('dollareus:schema-migrations'))").catch(() => undefined);
    }
    client.release();
  }
} finally {
  await pool.end();
}
