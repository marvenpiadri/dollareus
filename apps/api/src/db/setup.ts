import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

type AppliedMigration = { name: string; checksum: string };

try {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('dollareus:schema-migrations'))");
    lockAcquired = true;

    const migrationTable = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );

    if (!migrationTable.rows[0]?.exists) {
      const existing = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'`
      );

      if (Number(existing.rows[0]?.count ?? 0) > 0) {
        throw new Error(
          'The public schema already contains tables but has no schema_migrations history. Refusing to adopt or modify an existing database automatically. Review it and establish a baseline migration deliberately.'
        );
      }

      await client.query(`
        CREATE TABLE public.schema_migrations (
          name text PRIMARY KEY,
          checksum char(64) NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    const files = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));

    for (const name of files) {
      if (!/^\\d{4}_[a-z0-9_]+\\.sql$/.test(name)) {
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
      const existingChecksum = applied.get(name);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Applied migration "${name}" has changed. Create a new migration instead of editing an applied migration.`
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
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
