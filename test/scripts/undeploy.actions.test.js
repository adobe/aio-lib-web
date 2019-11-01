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
const { vol, fs } = global.mockFs()

const AppScripts = require('../..')

const ioruntime = require('@adobe/aio-cli-plugin-runtime')
jest.mock('@adobe/aio-cli-plugin-runtime')

const openwhisk = require('openwhisk')
jest.mock('openwhisk')
const owGetPackageMock = jest.fn()
const owMock = {
  packages: {
    get: owGetPackageMock
  }
}
openwhisk.mockReturnValue(owMock)

const mockAIOConfig = require('@adobe/aio-lib-core-config')

let scripts
beforeEach(async () => {
  // create test app
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  openwhisk.mockClear()
  owGetPackageMock.mockReset()
  ioruntime.getProjectEntities.mockReset()
  ioruntime.processPackage.mockReset()
  ioruntime.undeployPackage.mockReset()

  scripts = await AppScripts()
})

afterEach(() => global.cleanFs(vol))

test('Undeploy should fail if the app package is not deployed', async () => {
  owGetPackageMock.mockRejectedValue({ statusCode: 404 })
  await expect(scripts.undeployActions()).rejects.toEqual(expect.objectContaining({
    message: expect.stringContaining('cannot undeploy actions for package sample-app-1.0.0, as it was not deployed')
  }))
})

test('Undeploy should fail if openwhisk.package.get fails', async () => {
  owGetPackageMock.mockRejectedValue(new Error('fake'))
  await expect(scripts.undeployActions()).rejects.toEqual(expect.objectContaining({
    message: expect.stringContaining('fake')
  }))
})

test('Undeploy 1 zip and 1 js action', async () => {
  owGetPackageMock.mockResolvedValue({ actions: ['action', 'action-zip'] })
  const returnedEntities = {
    actions: [{ name: 'sample-app-1.0.0/action' }, { name: 'sample-app-1.0.0/action' }],
    packages: ['sample-app-1.0.0'],
    triggers: [],
    rules: [],
    apis: []
  }
  ioruntime.getProjectEntities.mockResolvedValue(returnedEntities)
  ioruntime.processPackage.mockReturnValue({ apis: [] })
  await scripts.undeployActions()
  expect(ioruntime.undeployPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.undeployPackage).toHaveBeenCalledWith(returnedEntities, owMock, expect.anything())
})

test('Undeploy 1 zip and 1 js actions + junk actions in main package', async () => {
  owGetPackageMock.mockResolvedValue({ actions: ['action', 'action-zip', 'wskdebug-action'] })
  const returnedEntities = {
    actions: [{ name: 'sample-app-1.0.0/action' }, { name: 'sample-app-1.0.0/action' }],
    packages: ['sample-app-1.0.0'],
    triggers: [],
    rules: [],
    apis: []
  }
  ioruntime.getProjectEntities.mockResolvedValue(returnedEntities)
  ioruntime.processPackage.mockReturnValue({ apis: [] })
  await scripts.undeployActions()
  expect(ioruntime.undeployPackage).toHaveBeenCalledTimes(1)
  returnedEntities.actions.push('sample-app-1.0.0/wskdebug-action')
  expect(ioruntime.undeployPackage).toHaveBeenCalledWith(returnedEntities, owMock, expect.anything())
})

test('Undeploy 1 zip and 1 js actions + apis', async () => {
  owGetPackageMock.mockResolvedValue({ actions: ['action', 'action-zip', 'wskdebug-action'] })
  const returnedEntities = {
    actions: [{ name: 'sample-app-1.0.0/action' }, { name: 'sample-app-1.0.0/action' }],
    packages: ['sample-app-1.0.0'],
    triggers: [],
    rules: [],
    apis: []
  }
  ioruntime.getProjectEntities.mockResolvedValue(returnedEntities)
  ioruntime.processPackage.mockReturnValue({ apis: [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }] })
  await scripts.undeployActions()
  expect(ioruntime.undeployPackage).toHaveBeenCalledTimes(1)
  returnedEntities.apis = [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }]
  expect(ioruntime.undeployPackage).toHaveBeenCalledWith(returnedEntities, owMock, expect.anything())
})
