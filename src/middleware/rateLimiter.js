const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Global rate limiter
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  },
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
    });
  },
});

// Webhook limiter (higher volume)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ success: false, error: 'Rate limit exceeded' });
  },
});

module.exports = { rateLimiter, authLimiter, webhookLimiter };
