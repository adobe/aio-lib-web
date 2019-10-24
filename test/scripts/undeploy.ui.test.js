/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const { vol } = global.mockFs()

const CNAScripts = require('../..')

const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage')
const TvmClient = require('@adobe/aio-lib-core-tvm')
jest.mock('@adobe/aio-lib-core-tvm')
const tvmRequestMock = jest.fn()
const mockAIOConfig = require('@adobe/aio-lib-core-config')

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

describe('Undeploy static files with tvm', () => {
  let scripts
  beforeAll(async () => {
    // create test app
    global.loadFs(vol, 'sample-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
    scripts = await CNAScripts()
  })

  test('Should call tvm client and remote storage', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    spy.mockRestore()
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
    // create test app
    global.loadFs(vol, 'sample-app')
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
    scripts = await CNAScripts()
  })

  test('Should call remote storage once and call tvm client zero times', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    spy.mockRestore()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TvmClient.init).toHaveBeenCalledTimes(0)
  })

  test('Should call remote storage with ENV like credentials', async () => {
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    await scripts.undeployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3ENVCreds)
    spy.mockRestore()
  })
})
