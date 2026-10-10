import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const schemaPath = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));
const schema = await readFile(schemaPath, 'utf8');

try {
  const client = await pool.connect();
  try {
    const existing = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'`
    );

    if (Number(existing.rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'The public schema is not empty. Refusing to modify or erase existing database objects. Use an empty Neon database for the Dollareus fresh install.'
      );
    }

    await client.query(schema);
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );

    console.log(`[db:setup] Created ${tables.rowCount ?? 0} tables:`);
    for (const row of tables.rows) console.log(`  - ${row.table_name}`);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
