// tests/__mocks__/@sentry/node.js
// Stub out Sentry entirely for the test environment.
// Jest can't resolve node:util inside @sentry/node — this mock prevents the crash.

const noop = () => {};
const noopMiddleware = () => (req, res, next) => next();

module.exports = {
  init: noop,
  captureException: noop,
  captureMessage: noop,
  withScope: (cb) => cb({ setExtra: noop, setTag: noop, setUser: noop }),
  Handlers: {
    requestHandler: noopMiddleware,
    errorHandler: noopMiddleware,
    tracingHandler: noopMiddleware,
  },
  Integrations: {},
};