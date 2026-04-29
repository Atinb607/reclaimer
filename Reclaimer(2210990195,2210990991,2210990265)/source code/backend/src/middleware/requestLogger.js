const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logData = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ip: ip || req.connection?.remoteAddress,
      userId: req.user?.id,
      companyId: req.company?.id,
    };

    if (statusCode >= 500) {
      logger.error('Request error', logData);
    } else if (statusCode >= 400) {
      logger.warn('Request warning', logData);
    } else if (duration > 1000) {
      logger.warn('Slow request', logData);
    } else {
      logger.info('Request', logData);
    }
  });

  next();
}

module.exports = { requestLogger };
