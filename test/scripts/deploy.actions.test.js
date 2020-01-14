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

const mockAIOConfig = require('@adobe/aio-lib-core-config')

const ioruntime = require('@adobe/aio-cli-plugin-runtime')
jest.mock('@adobe/aio-cli-plugin-runtime')

const openwhisk = require('openwhisk')
jest.mock('openwhisk')

const deepCopy = require('lodash.clonedeep')

afterEach(() => global.cleanFs(vol))

beforeEach(() => {
  mockAIOConfig.get.mockReset()
  ioruntime.processPackage.mockReset()
  ioruntime.syncProject.mockReset()
})

const expectedDistManifest = {
  packages: {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: 'dist/actions/action.zip',
          runtime: 'nodejs:10',
          web: 'yes'
        },
        'action-zip': {
          function: 'dist/actions/action-zip.zip',
          runtime: 'nodejs:10',
          web: 'yes'
        }
      },
      sequences: {
        'action-sequence': {
          actions: 'action, action-zip',
          web: 'yes'
        }
      },
      triggers: {
        trigger1: null
      },
      rules: {
        rule1: {
          trigger: 'trigger1',
          action: 'action',
          rule: true
        }
      },
      apis: {
        api1: {
          base: {
            path: {
              action: {
                method: 'get'
              }
            }
          }
        }
      },
      dependencies: {
        dependency1: {
          location: 'fake.com/package'
        }
      }
    }
  }
}

const mockEntities = {
  pkgAndDeps: [{ name: 'sample-app-1.0.0' }, { name: 'dep' }],
  actions: [{ name: 'sample-app-1.0.0/action' }],
  triggers: [{ name: 'trigger' }],
  apis: [{ name: 'api' }],
  rules: [{ name: 'rule' }]
}

test('deploy full manifest', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions()

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), true)
})

test('use deployConfig.filterEntities to deploy only one action', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      actions: ['action']
    }
  })

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest,
    { actions: [{ name: 'sample-app-1.0.0/action' }], apis: [], rules: [], triggers: [], pkgAndDeps: [] },
    { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities to deploy only one trigger and one action', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      actions: ['action'],
      triggers: ['trigger']
    }
  })

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest,
    { actions: [{ name: 'sample-app-1.0.0/action' }], apis: [], rules: [], triggers: [{ name: 'trigger' }], pkgAndDeps: [] },
    { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities to deploy only one trigger and one action and one rule', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      actions: ['action'],
      triggers: ['trigger'],
      rules: ['rule']
    }
  })

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest,
    { actions: [{ name: 'sample-app-1.0.0/action' }], apis: [], rules: [{ name: 'rule' }], triggers: [{ name: 'trigger' }], pkgAndDeps: [] },
    { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities to deploy only one action and one api', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      actions: ['action'],
      apis: ['api']
    }
  })

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest,
    { actions: [{ name: 'sample-app-1.0.0/action' }], apis: [{ name: 'api' }], rules: [], triggers: [], pkgAndDeps: [] },
    { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities to deploy only one pkg dependency', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      pkgAndDeps: ['dep']
    }
  })

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest,
    { actions: [], apis: [], rules: [], triggers: [], pkgAndDeps: [{ name: 'dep' }] },
    { fake: 'ow' }, expect.anything(), false)
})

test('Deploy actions should fail if there are no build files', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  expect(scripts.deployActions.bind(this)).toThrowWithMessageContaining(['build', 'missing'])
})
