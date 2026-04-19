const express = require('express');
const db = require('../models/db');
const logger = require('../utils/logger');
const { authenticate, authorizeCompany, requireRole } = require('../middleware/auth');
const { validate, createAutomationRuleSchema, updateAutomationRuleSchema } = require('../middleware/validators');

const router = express.Router();
router.use(authenticate);

// POST /automation/rules
router.post('/rules', validate(createAutomationRuleSchema), async (req, res, next) => {
  try {
    const { company_id, name, trigger_type, delay_minutes, message_template, step_order, stop_on_reply, is_active } = req.body;

    req.params.companyId = company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    const { rows: [rule] } = await db.query(
      `INSERT INTO automation_rules 
         (company_id, name, trigger_type, delay_minutes, message_template, step_order, stop_on_reply, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [company_id, name, trigger_type, delay_minutes, message_template, step_order, stop_on_reply, is_active]
    );

    logger.info('Automation rule created', { ruleId: rule.id, companyId: company_id });
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

// GET /automation/rules?company_id=&trigger_type=
router.get('/rules', async (req, res, next) => {
  try {
    const { company_id, trigger_type, active_only = 'true' } = req.query;
    if (!company_id) return res.status(400).json({ success: false, error: 'company_id required' });

    req.params.companyId = company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    let where = 'WHERE company_id = $1 AND deleted_at IS NULL';
    const params = [company_id];
    let idx = 2;

    if (trigger_type) {
      where += ` AND trigger_type = $${idx++}`;
      params.push(trigger_type);
    }
    if (active_only === 'true') {
      where += ' AND is_active = TRUE';
    }

    const { rows: rules } = await db.query(
      `SELECT * FROM automation_rules ${where} ORDER BY step_order ASC, delay_minutes ASC`,
      params
    );

    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
});

// PATCH /automation/rules/:id
router.patch('/rules/:id', validate(updateAutomationRuleSchema), async (req, res, next) => {
  try {
    const { rows: [rule] } = await db.query(
      'SELECT * FROM automation_rules WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

    req.params.companyId = rule.company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    const updates = req.body;
    const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`);
    const values = Object.values(updates);

    const { rows: [updated] } = await db.query(
      `UPDATE automation_rules SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /automation/rules/:id (soft delete)
router.delete('/rules/:id', async (req, res, next) => {
  try {
    const { rows: [rule] } = await db.query(
      'SELECT * FROM automation_rules WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

    req.params.companyId = rule.company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    await db.query('UPDATE automation_rules SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /automation/stats?company_id=
router.get('/stats', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ success: false, error: 'company_id required' });

    req.params.companyId = company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    const { rows: [stats] } = await db.query(
      `SELECT
         COUNT(DISTINCT l.id) FILTER (WHERE l.created_at > NOW() - INTERVAL '30 days') AS leads_30d,
         COUNT(DISTINCT m.id) FILTER (WHERE m.direction = 'outbound' AND m.created_at > NOW() - INTERVAL '30 days') AS messages_sent_30d,
         COUNT(DISTINCT l.id) FILTER (WHERE l.has_replied = TRUE AND l.created_at > NOW() - INTERVAL '30 days') AS replies_30d,
         COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS conversions_total
       FROM leads l
       LEFT JOIN messages m ON m.lead_id = l.id AND m.company_id = l.company_id
       WHERE l.company_id = $1`,
      [company_id]
    );

    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
