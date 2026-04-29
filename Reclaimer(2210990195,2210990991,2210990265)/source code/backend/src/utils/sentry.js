const Sentry = require('@sentry/node');
const logger = require('./logger');

function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    logger.warn('SENTRY_DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = '[Filtered]';
      }
      return event;
    },
  });

  logger.info('Sentry initialized');
}

// Sentry v8 uses setupExpressErrorHandler instead of Handlers
const Handlers = {
  requestHandler: () => (req, res, next) => next(),   // no-op passthrough
  errorHandler: () => (err, req, res, next) => next(err), // no-op passthrough
};

function captureException(err, context = {}) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureException(err);
  });
}

module.exports = { initSentry, Handlers, captureException };