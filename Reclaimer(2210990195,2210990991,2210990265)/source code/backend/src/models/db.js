'use strict';

const { Pool } = require('pg');
const logger = require('../utils/logger');

let poolConfig;

// ── Support both DATABASE_URL (Render/cloud) and individual vars (local) ──────
if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
} else {
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'saas_automation',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'localpassword',
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max:      parseInt(process.env.DB_POOL_MAX || '10'),
    idleTimeoutMillis:      30000,
    connectionTimeoutMillis: 10000,
  };
}

const pool = new Pool(poolConfig);

// ── Connection event logging ───────────────────────────────────────────────────
pool.on('connect', () => {
  logger.debug('New database client connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

// ── Query helper with logging ──────────────────────────────────────────────────
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { duration, text: text.substring(0, 100) });
    }
    return result;
  } catch (err) {
    logger.error('Database query error', { error: err.message, text, params });
    throw err;
  }
};

// ── Transaction helper ─────────────────────────────────────────────────────────
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Startup connectivity check ─────────────────────────────────────────────────
const connect = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('✅ Database connected');
  } finally {
    client.release();
  }
};

module.exports = { query, pool, withTransaction, connect };