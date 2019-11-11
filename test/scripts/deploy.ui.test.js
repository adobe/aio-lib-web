/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use scripts _file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const { vol } = global.mockFs()

const RemoteStorage = require('../../lib/remote-storage')
const AppScripts = require('../..')
const AbstractScript = require('../../lib/abstract-script')

const TvmClient = require('@adobe/aio-lib-core-tvm')
jest.mock('@adobe/aio-lib-core-tvm')
const tvmRequestMock = jest.fn()
const mockAIOConfig = require('@adobe/aio-lib-core-config')
jest.mock('../../lib/remote-storage')

beforeEach(() => {
  // clear stats on mocks
  RemoteStorage.mockClear()
  tvmRequestMock.mockReset()
  TvmClient.init.mockReset()

  tvmRequestMock.mockResolvedValue(global.fakeTVMResponse)
  TvmClient.init.mockResolvedValue({
    getAwsS3Credentials: tvmRequestMock
  })
})

afterEach(() => global.cleanFs(vol))

describe('Deploy static files with tvm', () => {
  let scripts
  let buildDir
  beforeEach(async () => {
    // create test app
    global.loadFs(vol, 'sample-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
    scripts = await AppScripts()
    buildDir = scripts._config.web.distProd
  })

  test('Should call tvm client and remote storage once', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TvmClient.init).toHaveBeenCalledWith(expect.objectContaining({
      ow: {
        namespace: scripts._config.ow.namespace,
        auth: scripts._config.ow.auth
      },
      apiUrl: scripts._config.s3.tvmUrl,
      cacheFile: scripts._config.s3.credsCacheFile
    }))
    expect(tvmRequestMock).toHaveBeenCalledTimes(1)
  })

  test('Should call remote storage with TVM like credentials', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3TVMCreds)
  })

  test('Should emit a warning event if the deployment existed', async () => {
    // spies can be restored
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    const spyEvent = jest.spyOn(AbstractScript.prototype, 'emit')
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(spyEvent).toHaveBeenCalledWith('warning', expect.any(String))
    spy.mockRestore()
    spyEvent.mockRestore()
  })

  test('Should return with the correct URL', async () => {
    // spies can be restored
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    const url = await scripts.deployUI()
    expect(url).toBe('https://fake_ns.fake-domain.net/sample-app-1.0.0/index.html')
  })

  test('Should fail if no build files', async () => {
    expect(scripts.deployUI.bind(scripts)).toThrowWithMessageContaining(['build', 'missing'])
  })
})

describe('Deploy static files with env credentials', () => {
  let scripts
  let buildDir
  beforeAll(async () => {
    // create test app
    global.loadFs(vol, 'sample-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
    scripts = await AppScripts()
    buildDir = scripts._config.web.distProd
  })

  test('Should call remote storage once and call tvm client zero times', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TvmClient.init).toHaveBeenCalledTimes(0)
  })

  test('Should call remote storage with ENV like credentials', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3ENVCreds)
  })
})

describe(' Test with No package app ', () => {
  let scripts
  beforeAll(async () => {
    // create test app
    global.loadFs(vol, 'no-package-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
    scripts = await AppScripts()
  })

  test('Should throw error for no Index.html', async () => {
    try {
      await scripts.deployUI()
    } catch (e) {
      expect(e.message).toBe('cannot deploy UI, app has no frontend')
    }
  })
})
