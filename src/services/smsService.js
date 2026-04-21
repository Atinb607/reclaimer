const twilio = require('twilio');
const db = require('../models/db');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone');

let client;

function getClient() {
  if (!client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

/**
 * Send an SMS message via Twilio
 * Handles DB insertion + API call atomically
 */
async function sendSMS({ companyId, leadId, ruleId = null, body, toPhone }) {
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  if (!fromPhone) throw new Error('TWILIO_PHONE_NUMBER not configured');

  // Insert message record first (pending state)
  const { rows: [message] } = await db.query(
    `INSERT INTO messages (company_id, lead_id, automation_rule_id, direction, body, status, provider)
     VALUES ($1, $2, $3, 'outbound', $4, 'pending', 'twilio')
     RETURNING id`,
    [companyId, leadId, ruleId, body]
  );

  try {
    // Only set statusCallback if it's a public URL — Twilio rejects localhost
    const cbUrl = process.env.TWILIO_WEBHOOK_URL?.replace('twilio-inbound', 'twilio-status');
    const isPublicUrl = cbUrl && !cbUrl.includes('localhost') && !cbUrl.includes('127.0.0.1');

    const twilioMessage = await getClient().messages.create({
      body,
      from: fromPhone,
      to: toPhone,
      ...(isPublicUrl && { statusCallback: cbUrl }),
    });

    // Update to queued/sent
    await db.query(
      `UPDATE messages SET status = 'queued', provider_sid = $1, sent_at = NOW()
       WHERE id = $2`,
      [twilioMessage.sid, message.id]
    );

    // Update lead status
    await db.query(
      `UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
       updated_at = NOW() WHERE id = $1`,
      [leadId]
    );

    logger.info('SMS sent', {
      messageId: message.id,
      sid: twilioMessage.sid,
      leadId,
      companyId,
    });

    return { messageId: message.id, sid: twilioMessage.sid, status: twilioMessage.status };
  } catch (err) {
    // Update message to failed
    await db.query(
      `UPDATE messages SET status = 'failed', error_code = $1, error_message = $2
       WHERE id = $3`,
      [err.code?.toString() || 'UNKNOWN', err.message, message.id]
    );

    logger.error('SMS send failed', {
      messageId: message.id,
      leadId,
      error: err.message,
      code: err.code,
    });

    throw err;
  }
}

/**
 * Validate a Twilio webhook request signature
 * Handles reverse proxy (nginx, Railway, Render) via X-Forwarded-Proto
 */
function validateTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  // Behind a reverse proxy, req.protocol is 'http' — use the forwarded header
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;

  return twilio.validateRequest(authToken, signature, url, req.body);
}

// ─── Keyword lists (TCPA-required) ────────────────────────────────────────────
const STOP_KEYWORDS  = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
const START_KEYWORDS = ['start', 'yes', 'unstop'];
const HELP_KEYWORDS  = ['help', 'info'];

/**
 * Handle an inbound SMS from Twilio.
 * Detects STOP/START/HELP keywords and responds accordingly (TCPA-compliant).
 * For all other messages, stores the record and signals lead replied.
 */
async function handleInboundSMS({ from, body, messageSid }) {
  logger.info('Inbound SMS received', { from, messageSid });

  const normalizedFrom = normalizePhone(from);
  const keyword = (body || '').trim().toLowerCase();

  // ── STOP ──────────────────────────────────────────────────────────────────
  if (STOP_KEYWORDS.includes(keyword)) {
    logger.info('STOP keyword received, marking lead DNC', { from: normalizedFrom });

    await db.query(
      `UPDATE leads
       SET status = 'do_not_contact', has_replied = TRUE,
           last_reply_at = NOW(), updated_at = NOW()
       WHERE phone = $1 AND deleted_at IS NULL`,
      [normalizedFrom]
    );

    await db.query(
      `INSERT INTO messages (company_id, lead_id, direction, body, status, provider, provider_sid)
       SELECT company_id, id, 'inbound', $1, 'received', 'twilio', $2
       FROM leads WHERE phone = $3 AND deleted_at IS NULL`,
      [body, messageSid, normalizedFrom]
    );

    return { action: 'stop', phone: normalizedFrom };
  }

  // ── START ─────────────────────────────────────────────────────────────────
  if (START_KEYWORDS.includes(keyword)) {
    logger.info('START keyword received, re-enabling lead', { from: normalizedFrom });

    await db.query(
      `UPDATE leads
       SET status = 'new', has_replied = FALSE, updated_at = NOW()
       WHERE phone = $1 AND status = 'do_not_contact' AND deleted_at IS NULL`,
      [normalizedFrom]
    );

    return { action: 'start', phone: normalizedFrom };
  }

  // ── HELP ──────────────────────────────────────────────────────────────────
  if (HELP_KEYWORDS.includes(keyword)) {
    logger.info('HELP keyword received', { from: normalizedFrom });
    return { action: 'help', phone: normalizedFrom };
  }

  // ── Normal reply ──────────────────────────────────────────────────────────
  const { rows: [lead] } = await db.query(
    `SELECT l.id, l.company_id FROM leads l
     WHERE l.phone = $1 AND l.deleted_at IS NULL
     ORDER BY l.created_at DESC LIMIT 1`,
    [normalizedFrom]
  );

  if (!lead) {
    logger.warn('Inbound SMS from unknown number', { from: normalizedFrom });
    return null;
  }

  await db.query(
    `INSERT INTO messages (company_id, lead_id, direction, body, status, provider, provider_sid)
     VALUES ($1, $2, 'inbound', $3, 'received', 'twilio', $4)`,
    [lead.company_id, lead.id, body, messageSid]
  );

  return { action: 'reply', leadId: lead.id, companyId: lead.company_id };
}

/**
 * Handle Twilio delivery status callback
 */
async function handleStatusCallback({ messageSid, status, errorCode, errorMessage }) {
  const statusMap = {
    queued: 'queued',
    sending: 'queued',
    sent: 'sent',
    delivered: 'delivered',
    undelivered: 'failed',
    failed: 'failed',
  };

  const dbStatus = statusMap[status] || status;

  await db.query(
    `UPDATE messages SET status = $1,
     ${dbStatus === 'delivered' ? 'delivered_at = NOW(),' : ''}
     error_code = $2, error_message = $3, updated_at = NOW()
     WHERE provider_sid = $4`,
    [dbStatus, errorCode || null, errorMessage || null, messageSid]
  );

  logger.info('Message status updated', { messageSid, status: dbStatus });
}

module.exports = { sendSMS, validateTwilioSignature, handleInboundSMS, handleStatusCallback };