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

const RemoteStorage = require('../../lib/remote-storage')
const TVMClient = require('../../lib/tvm-client')
const fs = require('fs-extra')
const CNAScripts = require('../..')
const AbstractScript = require('../../lib/abstract-script')

const mockAIOConfig = require('@adobe/aio-cli-config')
jest.mock('../../lib/remote-storage')
jest.mock('../../lib/tvm-client')
TVMClient.prototype.getCredentials = jest.fn().mockReturnValue(global.fakeTVMResponse)

beforeEach(() => {
  // clear stats on mocks
  RemoteStorage.mockClear()
  TVMClient.mockClear()
})

beforeAll(async () => {
  await global.mockFS()
})
afterAll(async () => {
  await global.resetFS()
})

describe('Deploy static files with tvm', () => {
  let scripts
  let buildDir
  beforeAll(async () => {
    // create test app
    await global.setTestAppAndEnv()
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
    scripts = await CNAScripts()
    buildDir = scripts._config.web.distProd
  })
  afterEach(async () => {
    await fs.remove(buildDir)
  })

  test('Should call tvm client and remote storage  once', async () => {
    await global.fakeFiles(buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TVMClient).toHaveBeenCalledTimes(1)
  })

  test('Should call remote storage with TVM like credentials', async () => {
    await global.fakeFiles(buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3TVMCreds)
  })

  test('Should emit a warning event if the deployment existed', async () => {
    // spies can be restored
    const spy = jest.spyOn(RemoteStorage.prototype, 'folderExists').mockReturnValue(true)
    const spyEvent = jest.spyOn(AbstractScript.prototype, 'emit')
    await global.fakeFiles(buildDir, ['index.html'])
    await scripts.deployUI()
    expect(spyEvent).toHaveBeenCalledWith('warning', expect.any(String))
    spy.mockRestore()
    spyEvent.mockRestore()
  })

  test('Should return with the correct URL', async () => {
    // spies can be restored
    await global.fakeFiles(buildDir, ['index.html'])
    const url = await scripts.deployUI()
    expect(url).toBe(`https://s3.amazonaws.com/${global.fakeS3Bucket}/${scripts._config.s3.folder}/index.html`)
  })

  test('Should fail if no build files', async () => {
    expect(scripts.deployUI.bind(this)).toThrowWithMessageContaining(['build', 'missing'])
  })
})

describe('Deploy static files with env credentials', () => {
  let scripts
  let buildDir
  beforeAll(async () => {
    // create test app
    await global.setTestAppAndEnv()
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
    scripts = await CNAScripts()
    buildDir = scripts._config.web.distProd
  })
  afterEach(async () => {
    await fs.remove(buildDir)
  })

  test('Should call remote storage once and call tvm client zero times', async () => {
    await global.fakeFiles(buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
    expect(TVMClient).toHaveBeenCalledTimes(0)
  })

  test('Should call remote storage with ENV like credentials', async () => {
    await global.fakeFiles(buildDir, ['index.html'])
    await scripts.deployUI()
    expect(RemoteStorage).toHaveBeenCalledWith(global.expectedS3ENVCreds)
  })
})
