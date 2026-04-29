require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Worker } = require('bullmq');
const { createConnection } = require('../utils/redis');
const db = require('../models/db');
const logger = require('../utils/logger');
const { sendSMS } = require('../services/smsService');
const { preSendChecks } = require('../services/automationEngine');
const { renderTemplate, buildTemplateData } = require('../utils/template');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 10;

/**
 * Main automation worker - processes send-automation-message jobs
 */
const automationWorker = new Worker(
  'automation',
  async (job) => {
    const { companyId, leadId, ruleId } = job.data;
    const jobId = job.id;

    logger.info('Processing automation job', { jobId, leadId, ruleId });

    // Update job log
    await db.query(
      `UPDATE jobs_log SET status = 'processing', started_at = NOW(), attempts = attempts + 1
       WHERE job_id = $1`,
      [jobId]
    );

    // Run pre-send checks
    const { shouldSend, reason } = await preSendChecks(leadId, ruleId, jobId);
    if (!shouldSend) {
      logger.info('Pre-send check failed, skipping', { jobId, leadId, ruleId, reason });
      await db.query(
        `UPDATE jobs_log SET status = 'completed', result = $1, completed_at = NOW()
         WHERE job_id = $2`,
        [JSON.stringify({ skipped: true, reason }), jobId]
      );
      return { skipped: true, reason };
    }

    // Fetch full data needed
    const [{ rows: [lead] }, { rows: [rule] }, { rows: [company] }] = await Promise.all([
      db.query('SELECT * FROM leads WHERE id = $1', [leadId]),
      db.query('SELECT * FROM automation_rules WHERE id = $1', [ruleId]),
      db.query('SELECT id, name, settings, industry FROM companies WHERE id = $1', [companyId]),
    ]);

    if (!lead || !rule || !company) {
      throw new Error('Missing required data for automation job');
    }

    // Render the message template
    const templateData = buildTemplateData(lead, company);
    const messageBody = renderTemplate(rule.message_template, templateData);

    // Send the SMS
    const result = await sendSMS({
      companyId,
      leadId,
      ruleId,
      body: messageBody,
      toPhone: lead.phone,
    });

    // Update job log as completed
    await db.query(
      `UPDATE jobs_log SET status = 'completed', result = $1, completed_at = NOW()
       WHERE job_id = $2`,
      [JSON.stringify(result), jobId]
    );

    logger.info('Automation job completed', { jobId, leadId, ruleId, messageId: result.messageId });
    return result;
  },
  {
    connection: createConnection(),
    concurrency: CONCURRENCY,
    limiter: {
      max: 100,
      duration: 1000, // Max 100 jobs/second globally
    },
  }
);

// Worker event handlers
automationWorker.on('active', (job) => {
  logger.debug(`Job ${job.id} started`);
});

automationWorker.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed`, { result });
});

automationWorker.on('failed', async (job, err) => {
  logger.error(`Job ${job.id} failed`, { error: err.message, attempts: job.attemptsMade });

  // Update job log
  if (job) {
    await db.query(
      `UPDATE jobs_log SET status = $1, last_error = $2, attempts = $3
       WHERE job_id = $4`,
      [
        job.attemptsMade >= job.opts.attempts ? 'failed' : 'pending',
        err.message,
        job.attemptsMade,
        job.id,
      ]
    ).catch((dbErr) => logger.error('Failed to update job log:', dbErr.message));
  }
});

automationWorker.on('error', (err) => {
  logger.error('Worker error:', err);
});

// Webhook processing worker
const webhookWorker = new Worker(
  'webhook-processing',
  async (job) => {
    const { type, payload } = job.data;
    logger.info('Processing webhook job', { type, jobId: job.id });

    // Import here to avoid circular deps
    const { processWebhookPayload } = require('../services/webhookProcessor');
    return processWebhookPayload(type, payload);
  },
  {
    connection: createConnection(),
    concurrency: 20,
  }
);

webhookWorker.on('failed', (job, err) => {
  logger.error(`Webhook job ${job?.id} failed`, { error: err.message });
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down workers...');
  await automationWorker.close();
  await webhookWorker.close();
  logger.info('Workers shut down');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info(`✅ Automation worker started (concurrency: ${CONCURRENCY})`);
logger.info('✅ Webhook processing worker started');

module.exports = { automationWorker, webhookWorker };
