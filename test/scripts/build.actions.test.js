// import exposed module
const fs = require('fs-extra')
const CNAScripts = require('../..')
const utils = require('../../lib/utils')

// mocks
jest.mock('parcel-bundler')
utils.installDeps = jest.fn()
// we are mocking zipfolder because of mock-fs not working properly
// with streams, this might change in future versions of mock-fs
utils.zipFolder = jest.fn((dir, out) => fs.writeFile(out, 'mock content'))

let scripts
let buildDir
beforeAll(async () => {
  await global.mockFS()
  // create test app
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  await global.clearProcessEnv()
  scripts = await CNAScripts(appDir)
  buildDir = scripts._config.actions.dist
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // cleanup build files
  await fs.remove(buildDir)
})

test('Build actions: 1 zip and 1 js', async () => {
  await scripts.buildActions()
  const buildFiles = await fs.readdir(buildDir)
  expect(buildFiles.sort()).toEqual(['action-zip.zip', 'action.js'].sort())
})
