// jest.config.js — project root
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 15000,
  forceExit: true,              // close open handles (BullMQ/Redis) after tests
  collectCoverageFrom: ['src/**/*.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
  moduleNameMapper: {
    '^@sentry/node$': '<rootDir>/tests/__mocks__/@sentry/node.js',
  },
};