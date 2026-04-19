const logger = require('../utils/logger');
const { captureException } = require('../utils/sentry');

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log the error
  if (status >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      userId: req.user?.id,
      companyId: req.company?.id,
    });
    captureException(err, { url: req.url, userId: req.user?.id });
  } else {
    logger.warn('Client error', { message: err.message, url: req.url, status });
  }

  // Don't expose internal errors to client in production
  const message = isOperational || process.env.NODE_ENV !== 'production'
    ? err.message
    : 'An internal error occurred';

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * Create an operational error (safe to expose to client)
 */
function createError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.isOperational = true;
  return err;
}

module.exports = { errorHandler, createError };
