// import exposed module
const fs = require('fs-extra')
const CNAScripts = require('../..')

jest.mock('parcel-bundler')

let scripts
let buildDir
beforeAll(async () => {
  // mockFS
  await global.mockFS()
  // create test app
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  await global.clearProcessEnv()

  scripts = await CNAScripts(appDir)
  buildDir = scripts._config.web.distProd
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // cleanup build files
  await fs.remove(buildDir)
})

test('Build static files: index.html', async () => {
  await scripts.buildUI()
  const buildFiles = await fs.readdir(buildDir)
  expect(buildFiles.sort()).toEqual(['index.html'])
})
