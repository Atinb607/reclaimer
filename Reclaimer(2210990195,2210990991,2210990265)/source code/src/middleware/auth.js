const jwt = require('jsonwebtoken');
const db = require('../models/db');
const logger = require('../utils/logger');

/**
 * Verify JWT and attach user + company context to request
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Token expired' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Fetch fresh user data (handles deactivated accounts)
    const { rows: [user] } = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.userId]
    );

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'User not found or deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err);
    next(err);
  }
}

/**
 * Verify user belongs to the requested company
 * Must be called after authenticate()
 */
async function authorizeCompany(req, res, next) {
  try {
    const companyId = req.params.companyId || req.body.company_id || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    // Super admins bypass company check
    if (req.user.role === 'admin') {
      const { rows: [company] } = await db.query(
        'SELECT id, name, is_active FROM companies WHERE id = $1 AND deleted_at IS NULL',
        [companyId]
      );
      if (!company || !company.is_active) {
        return res.status(404).json({ success: false, error: 'Company not found' });
      }
      req.company = company;
      return next();
    }

    // Regular users must be members of the company
    const { rows: [membership] } = await db.query(
      `SELECT cu.role, c.id, c.name, c.is_active, c.settings, c.timezone, c.plan
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.user_id = $1 AND cu.company_id = $2 AND c.deleted_at IS NULL`,
      [req.user.id, companyId]
    );

    if (!membership || !membership.is_active) {
      return res.status(403).json({ success: false, error: 'Access denied to this company' });
    }

    req.company = membership;
    req.companyRole = membership.role;
    next();
  } catch (err) {
    logger.error('Company auth middleware error:', err);
    next(err);
  }
}

/**
 * Require a specific role (owner or admin only)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const companyRole = req.companyRole;
    
    if (userRole === 'admin') return next(); // Global admins bypass all
    if (roles.includes(companyRole) || roles.includes(userRole)) return next();
    
    return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  };
}

module.exports = { authenticate, authorizeCompany, requireRole };
