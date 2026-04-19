const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'saas_automation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  logger.debug('New database client connected');
});

/**
 * Execute a single query
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn('Slow query detected', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    logger.error('Database query error', { text, params, error: err.message });
    throw err;
  }
}

/**
 * Execute multiple queries in a transaction
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get a raw client for complex operations
 */
async function getClient() {
  return pool.connect();
}

/**
 * Test connection
 */
async function connect() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

/**
 * Close all connections
 */
async function end() {
  await pool.end();
}

module.exports = { query, transaction, getClient, connect, end, pool };
