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

const AppScripts = require('../..')

const runtimeLibUtils = require('@adobe/aio-lib-runtime').utils
jest.mock('@adobe/aio-lib-runtime')

const openwhisk = require('@adobe/aio-lib-runtime').init
jest.mock('@adobe/aio-lib-runtime')
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
  runtimeLibUtils.getProjectEntities.mockReset()
  runtimeLibUtils.processPackage.mockReset()
  runtimeLibUtils.undeployPackage.mockReset()

  scripts = await AppScripts()
})

const setOwGetPackageMockResponse = (packageName, actions) => {
  owGetPackageMock.mockResolvedValue({
    actions: actions.map(actionName => ({
      // annotations: [{ key: 'fake', value: true }],
      name: actionName // ,
      // version: '0.0.42'
    })),
    annotations: [],
    binding: {},
    feeds: [],
    name: packageName,
    namespace: global.fakeConfig.tvm.runtime.namespace,
    parameters: [],
    publish: false,
    version: '0.0.17'
  })
}

const setRuntimeGetProjectEntitiesMock = (packageName, actions) => {
  runtimeLibUtils.getProjectEntities.mockResolvedValue({
    actions: actions.map(actionName => ({
      // annotations: [{ key: 'fake', value: true }],
      // exec: { binary: true },
      // limits: { concurrency: 200, logs: 10, memory: 256, timeout: 60000 },
      name: packageName + '/' + actionName // ,
      // namespace: global.fakeConfig.tvm.runtime.namespace + '/' + packageName, // weird but this is what it returns
      // publish: false,
      // updated: 626569200000,
      // version: '0.0.42'
    })),
    triggers: [],
    rules: [],
    pkgAndDeps: [], // does not include the name of current package (only dependencies)
    apis: [] // always empty as apis have not the whisk-managed annotation
  })
}

afterEach(() => global.cleanFs(vol))

test('should fail if the app package is not deployed', async () => {
  owGetPackageMock.mockRejectedValue({ statusCode: 404 })
  await expect(scripts.undeployActions()).rejects.toEqual(expect.objectContaining({
    message: expect.stringContaining('cannot undeploy actions for package sample-app-1.0.0, as it was not deployed')
  }))
})

test('should fail if openwhisk.package.get fails', async () => {
  owGetPackageMock.mockRejectedValue(new Error('fake'))
  await expect(scripts.undeployActions()).rejects.toEqual(expect.objectContaining({
    message: expect.stringContaining('fake')
  }))
})

test('should undeploy two already deployed actions', async () => {
  setOwGetPackageMockResponse('sample-app-1.0.0', ['action', 'action-zip'])
  setRuntimeGetProjectEntitiesMock('sample-app-1.0.0', ['action', 'action-zip'])
  runtimeLibUtils.processPackage.mockReturnValue({ apis: [], rules: [] })

  const expectedEntities = {
    actions: [{ name: 'sample-app-1.0.0/action' }, { name: 'sample-app-1.0.0/action-zip' }],
    pkgAndDeps: [],
    triggers: [],
    rules: [],
    apis: []
  }

  await scripts.undeployActions()
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledTimes(1)
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should undeploy actions that are not managed but part of a deployed app package (e.g. junk wskdebug action)', async () => {
  setOwGetPackageMockResponse('sample-app-1.0.0', ['action', 'action-zip', 'fake-wskdebug-action'])
  setRuntimeGetProjectEntitiesMock('sample-app-1.0.0', ['action', 'action-zip'])
  runtimeLibUtils.processPackage.mockReturnValue({ apis: [], rules: [] })

  const expectedEntities = {
    actions: [{ name: 'sample-app-1.0.0/action' }, { name: 'sample-app-1.0.0/action-zip' }, { name: 'sample-app-1.0.0/fake-wskdebug-action' }],
    pkgAndDeps: [],
    triggers: [],
    rules: [],
    apis: []
  }

  await scripts.undeployActions()
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledTimes(1)
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should undeploy apis defined in the manifest', async () => {
  setOwGetPackageMockResponse('sample-app-1.0.0', [])
  setRuntimeGetProjectEntitiesMock('sample-app-1.0.0', [])
  runtimeLibUtils.processPackage.mockReturnValue({ apis: [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }], rules: [] })

  const expectedEntities = {
    actions: [],
    pkgAndDeps: [],
    triggers: [],
    rules: [],
    apis: [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }]
  }

  await scripts.undeployActions()
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledTimes(1)
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should undeploy apis defined in the manifest with named package', async () => {
  global.loadFs(vol, 'named-package')
  scripts = await AppScripts()

  setOwGetPackageMockResponse('bobby-mcgeee', [])
  setRuntimeGetProjectEntitiesMock('bobby-mcgeee', [])
  runtimeLibUtils.processPackage.mockReturnValue({ apis: [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }], rules: [] })

  const expectedEntities = {
    actions: [],
    pkgAndDeps: [],
    triggers: [],
    rules: [],
    apis: [{ name: 'fake', basepath: '/fake', relpath: '/path/to/endpoint' }]
  }

  await scripts.undeployActions()
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledTimes(1)
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should undeploy rules defined in the manifest', async () => {
  setOwGetPackageMockResponse('sample-app-1.0.0', [])
  setRuntimeGetProjectEntitiesMock('sample-app-1.0.0', [])
  ioruntime.processPackage.mockReturnValue({ apis: [], rules: [{ name: 'fakeRule' }] })

  const expectedEntities = {
    actions: [],
    pkgAndDeps: [],
    triggers: [],
    rules: [{ name: 'fakeRule' }],
    apis: []
  }

  await scripts.undeployActions()
  expect(ioruntime.undeployPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should undeploy rules defined in the manifest with named package', async () => {
  global.loadFs(vol, 'named-package')
  scripts = await AppScripts()

  setOwGetPackageMockResponse('bobby-mcgeee', [])
  setRuntimeGetProjectEntitiesMock('bobby-mcgeee', [])
  ioruntime.processPackage.mockReturnValue({ apis: [], rules: [{ name: 'fakeRule' }] })

  const expectedEntities = {
    actions: [],
    pkgAndDeps: [],
    triggers: [],
    rules: [{ name: 'fakeRule' }],
    apis: []
  }

  await scripts.undeployActions()
  expect(ioruntime.undeployPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('should not attempt to undeploy actions that are defined in manifest but not deployed', async () => {
  setOwGetPackageMockResponse('sample-app-1.0.0', [])
  setRuntimeGetProjectEntitiesMock('sample-app-1.0.0', [])
  runtimeLibUtils.processPackage.mockReturnValue({ apis: [], actions: [{ name: 'fake-action' }], rules: [] })

  const expectedEntities = {
    actions: [],
    pkgAndDeps: [],
    triggers: [],
    rules: [],
    apis: []
  }

  await scripts.undeployActions()
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledTimes(1)
  expect(runtimeLibUtils.undeployPackage).toHaveBeenCalledWith(expectedEntities, owMock, expect.anything())
})

test('No backend is present', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  vol.unlinkSync('./manifest.yml')

  const scripts = await AppScripts()
  await expect(scripts.undeployActions()).rejects.toThrow('cannot undeploy actions, app has no backend')
})
