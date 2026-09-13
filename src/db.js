import pg from 'pg';

const { Pool } = pg;

export function createPool({ connectionString = process.env.DATABASE_URL } = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
