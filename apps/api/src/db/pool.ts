import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const sqlHost = process.env.SQL_HOST;
const sqlUser = process.env.SQL_USER;
const sqlDatabase = process.env.SQL_DB_NAME;

if (!connectionString && !(sqlHost && sqlUser && sqlDatabase)) {
  throw new Error('Database configuration is required. Set DATABASE_URL or SQL_HOST, SQL_USER, SQL_DB_NAME and SQL_PASSWORD. Dollareus never silently switches to a mock database.');
}

const poolOptions = {
  max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ...(connectionString ? { connectionString, ...(connectionString.includes('sslmode=require') ? { ssl: { rejectUnauthorized: true } } : {}) } : { host: sqlHost, user: sqlUser, password: process.env.SQL_PASSWORD, database: sqlDatabase, connectionTimeoutMillis: 15_000 })
};

export const pool = new Pool(poolOptions);

pool.on('error', (error) => { console.error('[postgres] Idle client error:', error.message); });
