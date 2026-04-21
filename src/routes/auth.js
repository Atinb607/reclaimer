const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const logger = require('../utils/logger');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate, registerSchema, loginSchema } = require('../middleware/validators');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /auth/register
router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, company_name, industry, timezone } = req.body;

    // Check if email already exists
    const { rows: [existing] } = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await db.transaction(async (client) => {
      // Create user
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'owner')
         RETURNING id, email, first_name, last_name, role`,
        [email, password_hash, first_name, last_name]
      );

      // Create company
      const { rows: [company] } = await client.query(
        `INSERT INTO companies (name, industry, timezone)
         VALUES ($1, $2, $3)
         RETURNING id, name`,
        [company_name, industry, timezone]
      );

      // Link user to company as owner
      await client.query(
        `INSERT INTO company_users (company_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [company.id, user.id]
      );

      return { user, company };
    });

    const token = jwt.sign(
      { userId: result.user.id, email: result.user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('User registered', { userId: result.user.id, companyId: result.company.id });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: result.user,
        company: result.company,
      },
    });
  } catch (err) {
    // Postgres unique violation — race condition between the SELECT check and INSERT
    // e.g. two concurrent registrations with the same email
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }
    next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows: [user] } = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Get user's companies
    const { rows: companies } = await db.query(
      `SELECT c.id, c.name, c.industry, cu.role
       FROM company_users cu JOIN companies c ON c.id = cu.company_id
       WHERE cu.user_id = $1 AND c.deleted_at IS NULL AND c.is_active = TRUE`,
      [user.id]
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('User logged in', { userId: user.id });

    const { password_hash, ...safeUser } = user;
    res.json({
      success: true,
      data: { token, user: safeUser, companies },
    });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows: companies } = await db.query(
      `SELECT c.id, c.name, c.industry, c.plan, cu.role
       FROM company_users cu JOIN companies c ON c.id = cu.company_id
       WHERE cu.user_id = $1 AND c.deleted_at IS NULL`,
      [req.user.id]
    );

    res.json({ success: true, data: { user: req.user, companies } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;