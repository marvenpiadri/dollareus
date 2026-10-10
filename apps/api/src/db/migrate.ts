import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  ssl: connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: true }
    : undefined
});

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const lockKey = 731904210;

try {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      );
      if (alreadyApplied.rowCount) {
        console.log(`[db:migrate] already applied: ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      console.log(`[db:migrate] applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[db:migrate] applied: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
