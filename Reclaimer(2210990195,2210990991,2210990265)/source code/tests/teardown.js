// tests/teardown.js
// Closes ALL async handles after the full test suite finishes.
// Prevents the "Jest did not exit" open handles warning.

module.exports = async () => {
  // Close DB pool
  try {
    const db = require('../src/models/db');
    await db.end();
  } catch (_) {}

  // Close Redis client
  try {
    const redis = require('../src/utils/redis');
    await redis.quit();
  } catch (_) {}

  // Close BullMQ queue connections (Queue + QueueEvents hold open ioredis clients)
  try {
    const {
      automationQueue,
      resurrectionQueue,
      webhookProcessingQueue,
      automationEvents,
    } = require('../src/services/queue');

    await Promise.allSettled([
      automationQueue.close(),
      resurrectionQueue.close(),
      webhookProcessingQueue.close(),
      automationEvents.close(),
    ]);
  } catch (_) {}
};