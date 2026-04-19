const { Queue, QueueEvents } = require('bullmq');
const { createConnection } = require('../utils/redis');
const logger = require('../utils/logger');

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s, 25s, 125s
  },
  removeOnComplete: { count: 1000, age: 86400 }, // Keep 1k completed, 24h
  removeOnFail: { count: 5000, age: 7 * 86400 }, // Keep 5k failed, 7d
};

// Queue definitions
const automationQueue = new Queue('automation', {
  connection: createConnection(),
  defaultJobOptions,
});

const resurrectionQueue = new Queue('resurrection', {
  connection: createConnection(),
  defaultJobOptions,
});

const webhookProcessingQueue = new Queue('webhook-processing', {
  connection: createConnection(),
  defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
});

// Queue events for monitoring
const automationEvents = new QueueEvents('automation', {
  connection: createConnection(),
});

automationEvents.on('completed', ({ jobId }) => {
  logger.debug(`Automation job ${jobId} completed`);
});

automationEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Automation job ${jobId} failed`, { reason: failedReason });
});

/**
 * Schedule an automation message job
 */
async function scheduleAutomationJob({ companyId, leadId, ruleId, delayMinutes, idempotencyKey }) {
  const delay = delayMinutes * 60 * 1000; // Convert to ms

  const job = await automationQueue.add(
    'send-automation-message',
    { companyId, leadId, ruleId },
    {
      delay,
      jobId: idempotencyKey, // Idempotent: prevents duplicate scheduling
    }
  );

  logger.info('Automation job scheduled', {
    jobId: job.id,
    companyId,
    leadId,
    ruleId,
    delayMinutes,
  });

  return job;
}

/**
 * Cancel all pending automation jobs for a lead
 */
async function cancelLeadJobs(leadId) {
  const jobs = await automationQueue.getJobs(['delayed', 'waiting']);
  let cancelled = 0;

  for (const job of jobs) {
    if (job.data?.leadId === leadId) {
      await job.remove();
      cancelled++;
    }
  }

  logger.info(`Cancelled ${cancelled} pending jobs for lead ${leadId}`);
  return cancelled;
}

/**
 * Schedule a webhook processing job
 */
async function scheduleWebhookJob(payload, priority = 1) {
  return webhookProcessingQueue.add('process-webhook', payload, { priority });
}

/**
 * Get queue health stats
 */
async function getQueueStats() {
  const [autoStats, resStats, webhookStats] = await Promise.all([
    getStats(automationQueue),
    getStats(resurrectionQueue),
    getStats(webhookProcessingQueue),
  ]);

  return {
    automation: autoStats,
    resurrection: resStats,
    webhookProcessing: webhookStats,
  };
}

async function getStats(queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

module.exports = {
  automationQueue,
  resurrectionQueue,
  webhookProcessingQueue,
  scheduleAutomationJob,
  cancelLeadJobs,
  scheduleWebhookJob,
  getQueueStats,
};
