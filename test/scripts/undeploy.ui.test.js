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
const CNAScripts = require('../..')

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

describe('Undeploy static files with tvm', () => {
  let scripts
  beforeAll(async () => {
    // create test env
    await global.setTestAppAndEnv(global.fakeEnvs.tvm)
    scripts = await CNAScripts()
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
    // create test env
    await global.setTestAppAndEnv(global.fakeEnvs.creds)
    scripts = await CNAScripts()
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
