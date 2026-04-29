const express = require('express');
const db = require('../models/db');
const { authenticate, authorizeCompany, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /companies/:companyId
router.get('/:companyId', authorizeCompany, async (req, res, next) => {
  try {
    const { rows: [company] } = await db.query(
      `SELECT c.*, 
         (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.id AND l.deleted_at IS NULL) AS lead_count,
         (SELECT COUNT(*) FROM automation_rules ar WHERE ar.company_id = c.id AND ar.deleted_at IS NULL AND ar.is_active = TRUE) AS active_rules_count
       FROM companies c WHERE c.id = $1`,
      [req.params.companyId]
    );
    res.json({ success: true, data: company });
  } catch (err) {
    next(err);
  }
});

// PATCH /companies/:companyId
router.patch('/:companyId', authorizeCompany, requireRole('owner'), async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'email', 'address', 'timezone', 'settings'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`);
    const { rows: [company] } = await db.query(
      `UPDATE companies SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.companyId, ...Object.values(updates)]
    );
    res.json({ success: true, data: company });
  } catch (err) {
    next(err);
  }
});

// GET /companies/:companyId/webhook-integrations
router.get('/:companyId/webhook-integrations', authorizeCompany, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, provider, name, is_active, last_event_at, created_at
       FROM webhook_integrations WHERE company_id = $1`,
      [req.params.companyId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /companies/:companyId/webhook-integrations
router.post('/:companyId/webhook-integrations', authorizeCompany, requireRole('owner'), async (req, res, next) => {
  try {
    const { provider, name, webhook_secret, config = {} } = req.body;
    const { encrypt } = require('../utils/encryption');
    
    const secretEnc = webhook_secret ? encrypt(webhook_secret) : null;

    const { rows: [integration] } = await db.query(
      `INSERT INTO webhook_integrations (company_id, provider, name, webhook_secret, config)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, provider, name, is_active, created_at`,
      [req.params.companyId, provider, name, secretEnc, JSON.stringify(config)]
    );

    // Return webhook URL for this integration
    const webhookUrl = `${req.protocol}://${req.get('host')}/webhooks/inbound/${req.params.companyId}/${integration.id}`;
    
    res.status(201).json({ success: true, data: { ...integration, webhook_url: webhookUrl } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
