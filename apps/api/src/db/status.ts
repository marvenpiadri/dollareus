import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { REQUIRED_SCHEMA_VERSION } from './schema-version.js';

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

type AppliedMigration = { name: string; checksum: string; appliedAt: Date | string };

let exitCode = 0;
try {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const invalidNames = files.filter((name) => !/^\\d{4}_[a-z0-9_]+\\.sql$/.test(name));
  if (invalidNames.length) {
    throw new Error(`Invalid migration filename(s): ${invalidNames.join(', ')}`);
  }
  if (files.at(-1) !== REQUIRED_SCHEMA_VERSION) {
    console.error(`[db:status] Runtime schema version is ${REQUIRED_SCHEMA_VERSION}, but the latest migration file is ${files.at(-1) ?? 'missing'}. Update apps/api/src/db/schema-version.ts.`);
    exitCode = 1;
  }

  const ledger = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
  );

  if (!ledger.rows[0]?.exists) {
    const existingTables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    console.log('[db:status] Migration history is not initialized.');
    console.log(`[db:status] ${existingTables.rowCount ?? 0} public table(s) found.`);
    if (existingTables.rowCount) {
      console.log('[db:status] Existing tables:');
      for (const row of existingTables.rows) console.log(`  - ${row.table_name}`);
      console.log('[db:status] Do not run migrations until this schema has been reviewed and deliberately baselined.');
    } else {
      console.log(`[db:status] ${files.length} migration(s) pending for an empty schema.`);
    }
    exitCode = 1;
  } else {
    const result = await pool.query<AppliedMigration>(
      'SELECT name, checksum, applied_at AS "appliedAt" FROM public.schema_migrations ORDER BY name'
    );
    const applied = new Map(result.rows.map((row) => [row.name, row]));
    let pending = 0;
    let drift = 0;

    for (const name of files) {
      const existing = applied.get(name);
      if (!existing) {
        console.log(`[pending] ${name}`);
        pending += 1;
        continue;
      }
      const checksum = createHash('sha256').update(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8')).digest('hex');
      if (existing.checksum.trim() !== checksum) {
        console.error(`[checksum mismatch] ${name} — applied migration was edited; create a new migration instead.`);
        drift += 1;
      } else {
        console.log(`[applied] ${name} — checksum matches`);
      }
    }

    const unknown = [...applied.keys()].filter((name) => !files.includes(name));
    for (const name of unknown) {
      console.error(`[unknown migration] ${name} is recorded in the database but missing from this code version.`);
    }

    console.log(`[db:status] ${files.length - pending} applied, ${pending} pending, ${drift} checksum mismatch(es), ${unknown.length} unknown migration(s).`);
    if (pending || drift || unknown.length) exitCode = drift || unknown.length ? 1 : 0;
  }
} catch (error) {
  console.error('[db:status] Unable to inspect the database:', error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await pool.end();
}

process.exitCode = exitCode;
