import pg from 'pg';

const { Pool } = pg;

const mockClient = {
  query: async () => ({ rows: [], rowCount: 0 }),
  release: () => {}
};

const mockPool: any = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => mockClient,
  on: () => mockPool,
  end: async () => {}
};

let poolInstance: any;

const sqlHost = process.env.SQL_HOST;
const sqlUser = process.env.SQL_USER;
const sqlPassword = process.env.SQL_PASSWORD;
const sqlDbName = process.env.SQL_DB_NAME;

if (sqlHost && sqlUser && sqlDbName) {
  try {
    poolInstance = new Pool({
      host: sqlHost,
      user: sqlUser,
      password: sqlPassword,
      database: sqlDbName,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
      connectionTimeoutMillis: 15_000,
    });
    poolInstance.on('error', (error: any) => {
      console.error('[postgres] Idle client error:', error?.message ?? error);
    });
  } catch (error) {
    console.warn('[AI Studio] Cloud SQL connection error — mock active', error);
    poolInstance = mockPool;
  }
} else if (process.env.DATABASE_URL) {
  try {
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    poolInstance.on('error', (error: any) => {
      console.error('[postgres] Idle client error:', error?.message ?? error);
    });
  } catch (error) {
    console.warn('[AI Studio] Database connection error — mock active', error);
    poolInstance = mockPool;
  }
} else {
  poolInstance = mockPool;
}

export const pool = poolInstance as InstanceType<typeof Pool>;

