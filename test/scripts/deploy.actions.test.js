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

const openwhisk = require('@adobe/aio-lib-runtime').init
jest.mock('@adobe/aio-lib-runtime')

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
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
        },
        'action-zip': {
          function: n('dist/actions/action-zip.zip'),
          runtime: 'nodejs:12',
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

const expectedOWOptions = { api_key: 'fake:auth', apihost: 'https://adobeioruntime.net', apiversion: 'v1', namespace: 'fake_ns' }

const mockEntities = { fake: true }
//   pkgAndDeps: [{ name: 'sample-app-1.0.0' }, { name: 'dep' }],
//   actions: [{ name: 'sample-app-1.0.0/action' }],
//   triggers: [{ name: 'trigger' }],
//   apis: [{ name: 'api' }],
//   rules: [{ name: 'rule' }]
// }

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
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), true)
})

test('deploy full manifest with package name specified', async () => {
  global.loadFs(vol, 'named-package')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const expectedNamedPackage = {
    'bobby-mcgee': expectedDistManifest.packages['sample-app-1.0.0']
  }

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions()

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedNamedPackage, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('bobby-mcgee', r('/manifest.yml'), { packages: expectedNamedPackage }, mockEntities, { fake: 'ow' }, expect.anything(), true)
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

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
        }
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
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
      triggers: ['trigger1']
    }
  })

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
        }
      },
      triggers: {
        trigger1: null
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
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
      triggers: ['trigger1'],
      rules: ['rule1']
    }
  })

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
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
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
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
      apis: ['api1']
    }
  })

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
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
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities to deploy only two actions and one sequence', async () => {
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
      actions: ['action', 'action-zip'],
      sequences: ['action-sequence']
    }
  })

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      actions: {
        action: {
          function: n('dist/actions/action.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
        },
        'action-zip': {
          function: n('dist/actions/action-zip.zip'),
          runtime: 'nodejs:12',
          web: 'yes'
        }
      },
      sequences: {
        'action-sequence': {
          actions: 'action, action-zip',
          web: 'yes'
        }
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
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
      dependencies: ['dependency1']
    }
  })

  const expectedDistPackagesFiltered = {
    'sample-app-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      dependencies: {
        dependency1: {
          location: 'fake.com/package'
        }
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', r('/manifest.yml'), expectedDistManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
})

test('use deployConfig.filterEntities on non existing pkgEntity should work', async () => {
  global.loadFs(vol, 'sample-app-reduced')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue(deepCopy(mockEntities))
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions([], {
    filterEntities: {
      triggers: ['trigger1'],
      sequences: ['notexisting']
    }
  })

  const expectedDistReducedManifest = {
    packages: {
      'sample-app-reduced-1.0.0': {
        license: 'Apache-2.0',
        version: '1.0.0',
        actions: {
          action: {
            function: n('dist/actions/action.zip'),
            runtime: 'nodejs:12',
            web: 'yes'
          }
        },
        triggers: {
          trigger1: null
        }
      }
    }
  }
  const expectedDistPackagesFiltered = {
    'sample-app-reduced-1.0.0': {
      license: 'Apache-2.0',
      version: '1.0.0',
      triggers: {
        trigger1: null
      }
    }
  }

  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistPackagesFiltered, {}, {}, {}, false, expectedOWOptions)

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-reduced-1.0.0', r('/manifest.yml'), expectedDistReducedManifest, mockEntities, { fake: 'ow' }, expect.anything(), false)
})

test('Deploy actions should fail if there are no build files and no filters', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  await expect(scripts.deployActions())
    .rejects.toThrow('missing files in dist')
})

test('Deploy actions should fail if there are no build files and action filter', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  await expect(scripts.deployActions([], { filterEntities: { actions: ['action', 'action-zip'] } }))
    .rejects.toThrow('missing files in dist')
})

test('Deploy actions should pass if there are no build files and filter does not include actions', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue({})

  const scripts = await AppScripts()
  await expect(scripts.deployActions([], { filterEntities: { triggers: ['trigger1'] } })).resolves.toEqual({})
})

test('if actions are deployed and part of the manifest it should return their url', async () => {
  global.loadFs(vol, 'sample-app-reduced')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  // mock deployed entities
  ioruntime.processPackage.mockReturnValue({
    actions: [
      { name: 'pkg/action' }, // must be referenced in fixture manifest file
      { name: 'pkg/actionNotInManifest' }
    ]
  })

  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  const returnedEntities = await scripts.deployActions()

  expect(returnedEntities).toEqual({
    actions: [
      {
        name: 'pkg/action',
        // no UI in sample-app reduced so url is pointing to adobeioruntime instead of cdn
        url: 'https://fake_ns.adobeioruntime.net/api/v1/web/sample-app-reduced-1.0.0/action'
      },
      { name: 'pkg/actionNotInManifest' }
    ]
  })
})

test('if actions are deployed with custom package and part of the manifest it should return their url', async () => {
  global.loadFs(vol, 'named-package')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  // mock deployed entities
  ioruntime.processPackage.mockReturnValue({
    actions: [
      { name: 'pkg/action' }, // must be referenced in fixture manifest file
      { name: 'pkg/actionNotInManifest' }
    ]
  })

  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  const returnedEntities = await scripts.deployActions()

  expect(returnedEntities).toEqual({
    actions: [
      {
        name: 'pkg/action',
        url: 'https://fake_ns.adobeio-static.net/api/v1/web/bobby-mcgee/action'
      },
      { name: 'pkg/actionNotInManifest' }
    ]
  })
})

test('if actions are deployed with the headless validator and there is a UI it should rewrite the sequence with the app-registry validator', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  // mock deployed entities
  ioruntime.processPackage.mockReturnValue({
    actions: [
      { name: 'pkg/sequence', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] } },
      { name: 'pkg/sequenceToReplace', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/headless', 'pkg/action'] } }
    ]
  })

  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  const returnedEntities = await scripts.deployActions()

  expect(returnedEntities).toEqual({
    actions: [
      {
        name: 'pkg/sequence',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] }
        // no url cause not referenced in manifest
      },
      {
        name: 'pkg/sequenceToReplace',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/app-registry', 'pkg/action'] }
      }
    ]
  })
})

test('if actions are deployed with the headless validator and there is no UI it should NOT rewrite the sequence with the app-registry validator', async () => {
  global.loadFs(vol, 'sample-app-reduced')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  // mock deployed entities
  ioruntime.processPackage.mockReturnValue({
    actions: [
      { name: 'pkg/sequence', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] } },
      { name: 'pkg/sequenceToReplace', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/headless', 'pkg/action'] } }
    ]
  })

  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  const returnedEntities = await scripts.deployActions()

  expect(returnedEntities).toEqual({
    actions: [
      {
        name: 'pkg/sequence',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] }
        // no url cause not referenced in manifest
      },
      {
        name: 'pkg/sequenceToReplace',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/headless', 'pkg/action'] }
      }
    ]
  })
})

test('if actions are deployed with the headless validator and custom package and there is a UI it should rewrite the sequence with the app-registry validator', async () => {
  global.loadFs(vol, 'named-package')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  // mock deployed entities
  ioruntime.processPackage.mockReturnValue({
    actions: [
      { name: 'pkg/sequence', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] } },
      { name: 'pkg/sequenceToReplace', exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/headless', 'pkg/action'] } }
    ]
  })

  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  const returnedEntities = await scripts.deployActions()

  expect(returnedEntities).toEqual({
    actions: [
      {
        name: 'pkg/sequence',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/not-headless', 'pkg/action'] }
        // no url cause not referenced in manifest
      },
      {
        name: 'pkg/sequenceToReplace',
        exec: { kind: 'sequence', components: ['/adobeio/shared-validators-v1/app-registry', 'pkg/action'] }
      }
    ]
  })
})

test('No backend is present', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  vol.unlinkSync('./manifest.yml')

  const scripts = await AppScripts()
  await expect(scripts.deployActions()).rejects.toThrow('cannot deploy actions, app has no backend')
})
