const RemoteStorage = require('../../lib/remote-storage')
const TVMClient = require('../../lib/tvm-client')
const fs = require('fs-extra')
const CNAScripts = require('../..')

jest.mock('../../lib/remote-storage')
jest.mock('../../lib/tvm-client')
TVMClient.prototype.getCredentials = jest.fn().mockReturnValue(global.fakeTVMResponse)
beforeEach(() => {
  // clear stats on mocks
  RemoteStorage.mockClear()
  TVMClient.mockClear()
})

let appDir
beforeAll(async () => {
  await global.mockFS()
  // create test app
  appDir = await global.createTestApp()
})
afterAll(async () => {
  await global.resetFS()
  await fs.remove(appDir)
})

describe('Undeploy static files with tvm', () => {
  let scripts
  beforeAll(async () => {
    await global.writeEnvTVM(appDir)
    await global.clearProcessEnv()
    scripts = await CNAScripts(appDir)
  })

  test('Should call tvm client and remote storage mocks once', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    spy.mockRestore()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TVMClient).toHaveBeenCalledTimes(1)
  })

  test('Should call remote storage with TVM like credentials', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3TVMCreds)
    spy.mockRestore()
  })

  test('Should throw an error if there are no deployment', async () => {
    // spies can be restored
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(false)
    expect(scripts.undeployUI.bind(this)).toThrowWithMessageContaining(['not', 'exist'])
    spy.mockRestore()
  })
})

describe('Undeploy static files with env credentials', () => {
  let scripts
  beforeAll(async () => {
    await global.writeEnvCreds(appDir)
    await global.clearProcessEnv()
    scripts = await CNAScripts(appDir)
  })

  test('Should call remote storage once and call tvm client zero times', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    spy.mockRestore()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TVMClient).toHaveBeenCalledTimes(0)
  })

  test('Should call remote storage with ENV like credentials', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3ENVCreds)
    spy.mockRestore()
  })
})
