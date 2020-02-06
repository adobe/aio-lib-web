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
const path = require('path')
const cloneDeep = require('lodash.clonedeep')

const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage')
const AppScripts = require('../..')

const TvmClient = require('@adobe/aio-lib-core-tvm')
jest.mock('@adobe/aio-lib-core-tvm')
const tvmRequestMock = jest.fn()
const mockAIOConfig = require('@adobe/aio-lib-core-config')

const mockOnProgress = jest.fn()
const mockOnWarning = jest.fn()

beforeEach(() => {
  // clear stats on mocks
  RemoteStorage.mockClear() // we cannot reset class members here
  tvmRequestMock.mockReset()
  TvmClient.init.mockReset()

  tvmRequestMock.mockResolvedValue(global.fakeTVMResponse)
  TvmClient.init.mockResolvedValue({
    getAwsS3Credentials: tvmRequestMock
  })
  mockOnProgress.mockReset()
  mockOnWarning.mockReset()
})

afterEach(() => global.cleanFs(vol))

describe('missing credentials/tvm url', () => {
  beforeEach(async () => {
    // create test app
    global.loadFs(vol, 'sample-app')
  })
  test('should use default tvm url is no tvm url nor s3 credentials configured', async () => {
    mockAIOConfig.get.mockReturnValue({})
    const scripts = await AppScripts()
    expect(scripts._config.s3.tvmUrl).toEqual(global.defaultTvmUrl)
  })

  test('should use default tvm url if there is no tvm url configured and missing cna.awsaccesskeyid', async () => {
    const config = cloneDeep(global.fakeConfig.creds)
    delete config.cna.awsaccesskeyid
    mockAIOConfig.get.mockReturnValue(config)
    const scripts = await AppScripts()
    expect(scripts._config.s3.tvmUrl).toEqual(global.defaultTvmUrl)
  })

  test('should use default tvm url if there is no tvm url configured and missing cna.s3bucket', async () => {
    const config = cloneDeep(global.fakeConfig.creds)
    delete config.cna.s3bucket
    mockAIOConfig.get.mockReturnValue(config)
    const scripts = await AppScripts()
    expect(scripts._config.s3.tvmUrl).toEqual(global.defaultTvmUrl)
  })

  test('should use default tvm url if there is no tvm url configured and missing cna.awssecretaccesskey', async () => {
    const config = cloneDeep(global.fakeConfig.creds)
    delete config.cna.awssecretaccesskey
    mockAIOConfig.get.mockReturnValue(config)
    const scripts = await AppScripts()
    expect(scripts._config.s3.tvmUrl).toEqual(global.defaultTvmUrl)
  })
})

describe('deploy static files with tvm', () => {
  let scripts
  let buildDir
  beforeEach(async () => {
    // create test app
    global.loadFs(vol, 'sample-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
    scripts = await AppScripts({ listeners: { onProgress: mockOnProgress, onWarning: mockOnWarning } })
    buildDir = scripts._config.web.distProd
  })

  test('should call tvm client and remote storage once', async () => {
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

  test('should call remote storage with TVM like credentials', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3TVMCreds)
  })

  test('should return with the default cdn domain url', async () => {
    // spies can be restored
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    const url = await scripts.deployUI()
    expect(url).toBe('https://fake_ns.adobeio-static.net/sample-app-1.0.0/index.html')
  })

  // below = those are common with s3 credential mode
  // todo move to different describe block
  test('should emit a warning event if the deployment existed', async () => {
    // spies can be restored
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    await scripts.deployUI()
    expect(mockOnWarning).toHaveBeenCalledWith('an already existing deployment for version 1.0.0 will be overwritten')
    spy.mockRestore()
  })

  test('should fail if no build files', async () => {
    expect(scripts.deployUI.bind(scripts)).toThrowWithMessageContaining(['build', 'missing'])
  })

  test('should fail build if app has no frontend', async () => {
    global.loadFs(vol, 'sample-app')
    await global.addFakeFiles(vol, buildDir, ['index.html'])

    mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

    scripts._config.app.hasFrontend = false

    await expect(scripts.deployUI()).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('app has no frontend') }))
  })

  test('should call onProgress listener', async () => {
    await global.addFakeFiles(vol, buildDir, ['index.html'])
    // spies can be restored

    const spy = jest.spyOn(RemoteStorage.prototype, 'uploadDir').mockImplementation((dir, prefix, config, progressCb) => {
      progressCb(path.join(buildDir, 'index.html'))
    })
    await scripts.deployUI()
    expect(mockOnProgress).toHaveBeenCalledWith('index.html')
    spy.mockRestore()
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
