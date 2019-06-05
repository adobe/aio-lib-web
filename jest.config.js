
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFilesAfterEnv: ['./test/jest.setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'index.js',
    'scripts/*.js',
    'lib/*.js'
  ]
}
