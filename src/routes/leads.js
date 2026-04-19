const express = require('express');
const db = require('../models/db');
const logger = require('../utils/logger');
const { authenticate, authorizeCompany } = require('../middleware/auth');
const { validate, createLeadSchema, updateLeadSchema } = require('../middleware/validators');

const router = express.Router();

// All routes require auth
router.use(authenticate);

// POST /leads - Create a lead
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const { company_id, phone, first_name, last_name, email, source, metadata } = req.body;

    // Verify user belongs to this company
    req.params.companyId = company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    // Normalize phone (strip non-digits, ensure +1 prefix for US)
    const normalizedPhone = normalizePhone(phone);

    // Upsert lead (idempotent by company + phone)
    const { rows: [lead] } = await db.query(
      `INSERT INTO leads (company_id, phone, first_name, last_name, email, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company_id, phone) DO UPDATE SET
         first_name = COALESCE(EXCLUDED.first_name, leads.first_name),
         last_name = COALESCE(EXCLUDED.last_name, leads.last_name),
         email = COALESCE(EXCLUDED.email, leads.email),
         source = COALESCE(EXCLUDED.source, leads.source),
         updated_at = NOW()
       RETURNING *`,
      [company_id, normalizedPhone, first_name, last_name, email, source, JSON.stringify(metadata)]
    );

    logger.info('Lead created/updated', { leadId: lead.id, companyId: company_id });
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
});

// GET /leads?company_id=&status=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { company_id, status, page = 1, limit = 50, q } = req.query;
    if (!company_id) return res.status(400).json({ success: false, error: 'company_id required' });

    req.params.companyId = company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    let whereClause = 'WHERE l.company_id = $1 AND l.deleted_at IS NULL';
    const params = [company_id];
    let paramIdx = 2;

    if (status) {
      whereClause += ` AND l.status = $${paramIdx++}`;
      params.push(status);
    }
    if (q) {
      whereClause += ` AND (l.phone ILIKE $${paramIdx} OR l.first_name ILIKE $${paramIdx} OR l.last_name ILIKE $${paramIdx} OR l.email ILIKE $${paramIdx})`;
      params.push(`%${q}%`);
      paramIdx++;
    }

    const [{ rows: leads }, { rows: [{ count }] }] = await Promise.all([
      db.query(
        `SELECT l.*, 
           (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id) AS message_count,
           (SELECT MAX(created_at) FROM messages m WHERE m.lead_id = l.id AND m.direction = 'outbound') AS last_contacted_at
         FROM leads l
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limitNum, offset]
      ),
      db.query(`SELECT COUNT(*) FROM leads l ${whereClause}`, params),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        total: parseInt(count),
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(parseInt(count) / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /leads/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [lead] } = await db.query(
      `SELECT l.* FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    req.params.companyId = lead.company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    // Get message history
    const { rows: messages } = await db.query(
      `SELECT id, direction, body, status, provider_sid, sent_at, created_at
       FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`,
      [lead.id]
    );

    res.json({ success: true, data: { ...lead, messages } });
  } catch (err) {
    next(err);
  }
});

// PATCH /leads/:id
router.patch('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const { rows: [lead] } = await db.query(
      'SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    req.params.companyId = lead.company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    const updates = req.body;
    const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`);
    const values = Object.values(updates);

    const { rows: [updated] } = await db.query(
      `UPDATE leads SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /leads/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [lead] } = await db.query(
      'SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    req.params.companyId = lead.company_id;
    await new Promise((resolve, reject) => {
      authorizeCompany(req, res, (err) => err ? reject(err) : resolve());
    });

    await db.query('UPDATE leads SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    next(err);
  }
});

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

module.exports = router;
