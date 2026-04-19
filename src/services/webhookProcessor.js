const db = require('../models/db');
const logger = require('../utils/logger');
const { triggerAutomation, handleLeadReply } = require('./automationEngine');

/**
 * Process different webhook payload types
 */
async function processWebhookPayload(type, payload) {
  switch (type) {
    case 'missed_call':
      return processMissedCall(payload);
    case 'form_submission':
      return processFormSubmission(payload);
    case 'inbound_sms_reply':
      return processInboundReply(payload);
    default:
      logger.warn('Unknown webhook type:', type);
      return null;
  }
}

async function processMissedCall({ companyId, phone, callerName, metadata = {} }) {
  // Upsert lead
  const normalizedPhone = normalizePhone(phone);
  const nameParts = (callerName || '').split(' ');

  const { rows: [lead] } = await db.query(
    `INSERT INTO leads (company_id, phone, first_name, last_name, source, status)
     VALUES ($1, $2, $3, $4, 'missed_call', 'new')
     ON CONFLICT (company_id, phone) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [companyId, normalizedPhone, nameParts[0] || null, nameParts.slice(1).join(' ') || null]
  );

  // Create event record
  const { rows: [event] } = await db.query(
    `INSERT INTO events (company_id, lead_id, event_type, source, raw_payload)
     VALUES ($1, $2, 'missed_call', 'webhook', $3)
     RETURNING id`,
    [companyId, lead.id, JSON.stringify({ phone, callerName, metadata })]
  );

  // Trigger automation
  const result = await triggerAutomation(lead.id, companyId, 'missed_call', event.id);

  // Mark event as processed
  await db.query(
    'UPDATE events SET processed = TRUE, processed_at = NOW() WHERE id = $1',
    [event.id]
  );

  return { leadId: lead.id, eventId: event.id, automation: result };
}

async function processFormSubmission({ companyId, phone, firstName, lastName, email, formName, metadata = {} }) {
  const normalizedPhone = normalizePhone(phone);

  const { rows: [lead] } = await db.query(
    `INSERT INTO leads (company_id, phone, first_name, last_name, email, source, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'new')
     ON CONFLICT (company_id, phone) DO UPDATE SET
       first_name = COALESCE(EXCLUDED.first_name, leads.first_name),
       last_name = COALESCE(EXCLUDED.last_name, leads.last_name),
       email = COALESCE(EXCLUDED.email, leads.email),
       updated_at = NOW()
     RETURNING *`,
    [companyId, normalizedPhone, firstName || null, lastName || null, email || null, formName || 'form_submission']
  );

  const { rows: [event] } = await db.query(
    `INSERT INTO events (company_id, lead_id, event_type, source, raw_payload)
     VALUES ($1, $2, 'form_submission', 'webhook', $3) RETURNING id`,
    [companyId, lead.id, JSON.stringify({ phone, firstName, lastName, email, formName, metadata })]
  );

  const result = await triggerAutomation(lead.id, companyId, 'form_submission', event.id);

  await db.query('UPDATE events SET processed = TRUE, processed_at = NOW() WHERE id = $1', [event.id]);

  return { leadId: lead.id, eventId: event.id, automation: result };
}

async function processInboundReply({ leadId, companyId }) {
  return handleLeadReply(leadId, companyId);
}

function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

module.exports = { processWebhookPayload, processMissedCall, processFormSubmission };
