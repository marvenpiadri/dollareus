import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL must be configured in production.');
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: true }
        : undefined
    })
  : null;

pool?.on('error', (error) => {
  // Never log credentials or the connection string.
  console.error('[database] Idle PostgreSQL client error:', error.message);
});
