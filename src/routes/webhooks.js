const express = require('express');
const db = require('../models/db');
const logger = require('../utils/logger');
const { webhookLimiter } = require('../middleware/rateLimiter');
const { validate, missedCallWebhookSchema } = require('../middleware/validators');
const { validateTwilioSignature, handleInboundSMS, handleStatusCallback } = require('../services/smsService');
const { scheduleWebhookJob } = require('../services/queue');
const { triggerAutomation } = require('../services/automationEngine');

const router = express.Router();
router.use(webhookLimiter);

// ─── Missed Call Webhook ───────────────────────────────────────────────────────
// POST /webhooks/missed-call
router.post('/missed-call', validate(missedCallWebhookSchema), async (req, res, next) => {
  try {
    const { company_id, caller_phone, caller_name, metadata } = req.body;

    // Validate company exists
    const { rows: [company] } = await db.query(
      'SELECT id FROM companies WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [company_id]
    );
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Queue the webhook for async processing
    await scheduleWebhookJob({
      type: 'missed_call',
      payload: {
        companyId: company_id,
        phone: caller_phone,
        callerName: caller_name,
        metadata,
      },
    });

    // Return immediately (don't block on automation)
    res.status(202).json({ success: true, message: 'Webhook queued for processing' });
  } catch (err) {
    next(err);
  }
});

// ─── HighLevel / Zapier Generic Webhook ───────────────────────────────────────
// POST /webhooks/inbound/:companyId/:integrationId
router.post('/inbound/:companyId/:integrationId', async (req, res, next) => {
  try {
    const { companyId, integrationId } = req.params;

    // Validate integration
    const { rows: [integration] } = await db.query(
      `SELECT * FROM webhook_integrations 
       WHERE id = $1 AND company_id = $2 AND is_active = TRUE`,
      [integrationId, companyId]
    );

    if (!integration) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }

    // Validate webhook secret if configured
    if (integration.webhook_secret) {
      const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-api-key'];
      if (providedSecret !== integration.webhook_secret) {
        logger.warn('Invalid webhook secret', { integrationId, companyId });
        return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      }
    }

    // Map provider payload to our standard format
    const payload = mapProviderPayload(integration.provider, req.body, companyId);
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Cannot parse webhook payload' });
    }

    await scheduleWebhookJob({ type: payload.type, payload: payload.data });

    // Update last event timestamp
    await db.query(
      'UPDATE webhook_integrations SET last_event_at = NOW() WHERE id = $1',
      [integrationId]
    );

    res.status(202).json({ success: true, message: 'Webhook received' });
  } catch (err) {
    next(err);
  }
});

// ─── Twilio Inbound SMS ────────────────────────────────────────────────────────
// POST /webhooks/twilio-inbound
router.post(
  '/twilio-inbound',
  express.urlencoded({ extended: false }), // Twilio sends form data
  async (req, res, next) => {
    try {
      // Validate Twilio signature in production
      if (process.env.NODE_ENV === 'production') {
        const isValid = validateTwilioSignature(req);
        if (!isValid) {
          logger.warn('Invalid Twilio signature on inbound webhook');
          return res.status(403).send('<Response></Response>');
        }
      }

      const { From, Body, MessageSid } = req.body;

      const result = await handleInboundSMS({ from: From, body: Body, messageSid: MessageSid });

      // ── Keyword actions ────────────────────────────────────────────────────
      if (result?.action === 'stop') {
        return res.type('text/xml').send(
          '<Response><Message>You have been unsubscribed and will receive no further messages. Reply START to resubscribe.</Message></Response>'
        );
      }

      if (result?.action === 'start') {
        return res.type('text/xml').send(
          '<Response><Message>You have been resubscribed and may receive messages again.</Message></Response>'
        );
      }

      if (result?.action === 'help') {
        return res.type('text/xml').send(
          '<Response><Message>For support, reply STOP to unsubscribe or contact us directly.</Message></Response>'
        );
      }

      // ── Normal reply — schedule async handling ─────────────────────────────
      if (result?.action === 'reply') {
        await scheduleWebhookJob({
          type: 'inbound_sms_reply',
          payload: { leadId: result.leadId, companyId: result.companyId },
        });
      }

      // Always respond 200 to Twilio
      res.type('text/xml').send('<Response></Response>');
    } catch (err) {
      logger.error('Twilio inbound webhook error:', err);
      res.type('text/xml').send('<Response></Response>');
    }
  }
);

// ─── Twilio Status Callback ────────────────────────────────────────────────────
// POST /webhooks/twilio-status
router.post(
  '/twilio-status',
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        const isValid = validateTwilioSignature(req);
        if (!isValid) {
          return res.status(403).send('<Response></Response>');
        }
      }

      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

      await handleStatusCallback({
        messageSid: MessageSid,
        status: MessageStatus,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
      });

      res.status(200).send('OK');
    } catch (err) {
      logger.error('Twilio status callback error:', err);
      res.status(200).send('OK'); // Always acknowledge
    }
  }
);

/**
 * Map different provider webhook payloads to our standard format
 */
function mapProviderPayload(provider, body, companyId) {
  switch (provider) {
    case 'highlevel':
      return {
        type: body.type === 'MissedCall' ? 'missed_call' : 'form_submission',
        data: {
          companyId,
          phone: body.phone || body.contact?.phone,
          firstName: body.contact?.firstName,
          lastName: body.contact?.lastName,
          email: body.contact?.email,
          callerName: body.contact?.name,
          metadata: body,
        },
      };

    case 'zapier':
      return {
        type: body.event_type || 'form_submission',
        data: {
          companyId,
          phone: body.phone,
          firstName: body.first_name || body.firstName,
          lastName: body.last_name || body.lastName,
          email: body.email,
          formName: body.form_name || 'zapier',
          metadata: body,
        },
      };

    case 'custom':
    default:
      if (!body.phone) return null;
      return {
        type: body.event_type || 'inbound_lead',
        data: {
          companyId,
          phone: body.phone,
          firstName: body.first_name,
          lastName: body.last_name,
          email: body.email,
          metadata: body,
        },
      };
  }
}

module.exports = router;