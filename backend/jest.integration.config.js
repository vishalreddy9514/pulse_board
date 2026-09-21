/**
 * Integration tests: these boot the real Nest application and talk to a real
 * Redis and Postgres, so they run separately from the unit suite.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'test',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
