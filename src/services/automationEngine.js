const db = require('../models/db');
const logger = require('../utils/logger');
const { scheduleAutomationJob, cancelLeadJobs } = require('./queue');

/**
 * Trigger automation for a lead event
 * @param {string} leadId
 * @param {string} companyId
 * @param {string} triggerType - 'missed_call', 'form_submission', etc.
 * @param {string} eventId
 */
async function triggerAutomation(leadId, companyId, triggerType, eventId) {
  logger.info('Triggering automation', { leadId, companyId, triggerType, eventId });

  // Check lead isn't DNC or already engaged
  const { rows: [lead] } = await db.query(
    'SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL',
    [leadId]
  );

  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.status === 'do_not_contact') {
    logger.info('Skipping automation: lead is DNC', { leadId });
    return { scheduled: 0, reason: 'do_not_contact' };
  }
  if (lead.has_replied) {
    logger.info('Skipping automation: lead has replied', { leadId });
    return { scheduled: 0, reason: 'has_replied' };
  }

  // Fetch active rules for this trigger type, ordered by step
  const { rows: rules } = await db.query(
    `SELECT * FROM automation_rules
     WHERE company_id = $1 AND trigger_type = $2 AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY step_order ASC, delay_minutes ASC`,
    [companyId, triggerType]
  );

  if (!rules.length) {
    logger.info('No active rules for trigger', { companyId, triggerType });
    return { scheduled: 0, reason: 'no_rules' };
  }

  let scheduled = 0;
  const scheduledJobs = [];

  for (const rule of rules) {
    // Idempotency key prevents duplicate scheduling
    const idempotencyKey = `automation-${companyId}-${leadId}-${rule.id}-${eventId}`;

    try {
      const job = await scheduleAutomationJob({
        companyId,
        leadId,
        ruleId: rule.id,
        delayMinutes: rule.delay_minutes,
        idempotencyKey,
      });

      // Log the job
      await db.query(
        `INSERT INTO jobs_log (company_id, lead_id, job_id, job_type, status, payload, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '${rule.delay_minutes} minutes')
         ON CONFLICT (job_id) DO NOTHING`,
        [
          companyId, leadId, idempotencyKey, 'automation-message',
          'pending', JSON.stringify({ ruleId: rule.id, eventId })
        ]
      );

      scheduledJobs.push({ jobId: job.id, ruleId: rule.id, delay: rule.delay_minutes });
      scheduled++;
    } catch (err) {
      // Job with same ID exists = already scheduled, skip
      if (err.message?.includes('already exists') || err.code === 'JOB_EXISTS') {
        logger.debug('Job already scheduled (idempotent)', { idempotencyKey });
      } else {
        logger.error('Failed to schedule job', { ruleId: rule.id, err: err.message });
      }
    }
  }

  logger.info('Automation scheduled', { leadId, scheduled, jobs: scheduledJobs });
  return { scheduled, jobs: scheduledJobs };
}

/**
 * Handle a lead reply - stop all pending automations
 */
async function handleLeadReply(leadId, companyId) {
  logger.info('Handling lead reply - cancelling automation', { leadId });

  // Mark lead as replied
  await db.query(
    `UPDATE leads SET has_replied = TRUE, last_reply_at = NOW(), status = 'engaged', updated_at = NOW()
     WHERE id = $1`,
    [leadId]
  );

  // Cancel all pending jobs for this lead
  const cancelled = await cancelLeadJobs(leadId);

  // Update job log
  await db.query(
    `UPDATE jobs_log SET status = 'cancelled' 
     WHERE lead_id = $1 AND status = 'pending'`,
    [leadId]
  );

  logger.info('Lead reply processed', { leadId, jobsCancelled: cancelled });
  return { cancelled };
}

/**
 * Check all pre-send conditions before sending a message
 */
async function preSendChecks(leadId, ruleId, jobId) {
  const checks = { shouldSend: true, reason: null };

  // 1. Check lead status
  const { rows: [lead] } = await db.query(
    'SELECT status, has_replied, deleted_at FROM leads WHERE id = $1',
    [leadId]
  );

  if (!lead || lead.deleted_at) {
    return { shouldSend: false, reason: 'lead_not_found' };
  }
  if (lead.has_replied) {
    return { shouldSend: false, reason: 'lead_replied' };
  }
  if (lead.status === 'do_not_contact') {
    return { shouldSend: false, reason: 'do_not_contact' };
  }

  // 2. Check if message already sent (idempotency)
  const { rows: [existingMsg] } = await db.query(
    `SELECT id FROM messages 
     WHERE lead_id = $1 AND automation_rule_id = $2 AND direction = 'outbound'
     AND status NOT IN ('failed') LIMIT 1`,
    [leadId, ruleId]
  );

  if (existingMsg) {
    return { shouldSend: false, reason: 'already_sent' };
  }

  // 3. Check if rule is still active
  const { rows: [rule] } = await db.query(
    'SELECT is_active, deleted_at FROM automation_rules WHERE id = $1',
    [ruleId]
  );

  if (!rule || !rule.is_active || rule.deleted_at) {
    return { shouldSend: false, reason: 'rule_inactive' };
  }

  return checks;
}

module.exports = { triggerAutomation, handleLeadReply, preSendChecks };