import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

export const pool = new Pool({
  connectionString,
  max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: true }
    : undefined
});

pool.on('error', (error) => {
  console.error('[postgres] Idle client error:', error.message);
});
