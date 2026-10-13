import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for the SQL snapshot contract test.');
const pool = new Pool({ connectionString, max: 1 });
const snapshot = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const schemaName = `dollareus_snapshot_${process.pid}_${Date.now()}`;
const client = await pool.connect();
const normalize = (rows) => rows.map((row) => `${row.table_name}.${row.column_name}|${row.data_type}|${row.udt_name}|${row.is_nullable}`).sort();

try {
  await client.query(`CREATE SCHEMA \"${schemaName}\"`);
  await client.query(`SET search_path TO \"${schemaName}\"`);
  await client.query(snapshot);
  const actual = await client.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY table_name, ordinal_position`);
  const expected = await client.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = $1 ORDER BY table_name, ordinal_position`, [schemaName]);
  const actualColumns = normalize(actual.rows);
  const expectedColumns = normalize(expected.rows);
  const missingFromSnapshot = actualColumns.filter((item) => !expectedColumns.includes(item));
  const missingFromDatabase = expectedColumns.filter((item) => !actualColumns.includes(item));
  if (missingFromSnapshot.length || missingFromDatabase.length) {
    console.error('SQL schema snapshot does not match the schema produced by migrations.');
    if (missingFromSnapshot.length) console.error('Present in migrated database only:', missingFromSnapshot.join(', '));
    if (missingFromDatabase.length) console.error('Present in snapshot only:', missingFromDatabase.join(', '));
    process.exitCode = 1;
  } else {
    const tableCount = new Set(expected.rows.map((row) => row.table_name)).size;
    console.log(`[db:schema-check] ${expectedColumns.length} columns across ${tableCount} tables match the migrated PostgreSQL schema.`);
  }
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.query(`DROP SCHEMA IF EXISTS \"${schemaName}\" CASCADE`).catch(() => undefined);
  client.release();
  await pool.end();
}
