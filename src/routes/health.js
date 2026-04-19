const express = require('express');
const db = require('../models/db');
const redis = require('../utils/redis');
const { getQueueStats } = require('../services/queue');
const logger = require('../utils/logger');

const router = express.Router();

// GET /health - Basic health check (no auth)
router.get('/', async (req, res) => {
  const start = Date.now();

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  res.json(health);
});

// GET /health/detailed - Full system health (protected, for monitoring tools)
router.get('/detailed', async (req, res) => {
  const apiKey = req.headers['x-health-key'];
  if (process.env.HEALTH_API_KEY && apiKey !== process.env.HEALTH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const checks = {
    database: { status: 'unknown' },
    redis: { status: 'unknown' },
    queues: { status: 'unknown' },
  };

  let overallStatus = 'ok';

  // Database check
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    checks.database = { status: 'ok', latency: `${Date.now() - start}ms` };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
    overallStatus = 'degraded';
  }

  // Redis check
  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { status: 'ok', latency: `${Date.now() - start}ms` };
  } catch (err) {
    checks.redis = { status: 'error', error: err.message };
    overallStatus = 'degraded';
  }

  // Queue stats
  try {
    const stats = await getQueueStats();
    checks.queues = { status: 'ok', stats };

    // Alert if too many failed jobs
    if (stats.automation.failed > 1000) {
      checks.queues.status = 'warning';
      checks.queues.warning = 'High failure count in automation queue';
    }
  } catch (err) {
    checks.queues = { status: 'error', error: err.message };
  }

  res.status(overallStatus === 'ok' ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks,
  });
});

module.exports = router;
