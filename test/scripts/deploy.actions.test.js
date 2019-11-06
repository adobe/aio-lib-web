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

afterEach(() => global.cleanFs(vol))

beforeEach(() => {
  mockAIOConfig.get.mockReset()
  ioruntime.processPackage.mockReset()
  ioruntime.deployPackage.mockReset()
})

test('Deploy 1 zip and 1 js action', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  ioruntime.processPackage.mockReturnValue({ fake: 'entities' })
  openwhisk.mockReturnValue({ fake: 'ow' })

  const scripts = await AppScripts()
  const buildDir = scripts._config.actions.dist
  // fake a previous build
  await global.addFakeFiles(vol, buildDir, ['action.js', 'action-zip.zip'])

  await scripts.deployActions()

  const expectedDistManifest = {
    packages: {
      'sample-app-1.0.0': {
        license: 'Apache-2.0',
        version: '1.0.0',
        actions: {
          action: {
            function:
            'dist/actions/action.js',
            main: 'module.exports.main',
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
            actions: 'action, action-zip'
          }
        }
      }
    }
  }
  expect(ioruntime.processPackage).toHaveBeenCalledTimes(1)
  expect(ioruntime.processPackage).toHaveBeenCalledWith(expectedDistManifest.packages, {}, {}, {})

  expect(ioruntime.syncProject).toHaveBeenCalledTimes(1)
  expect(ioruntime.syncProject).toHaveBeenCalledWith('sample-app-1.0.0', '/manifest.yml', expectedDistManifest, { fake: 'entities' }, { fake: 'ow' }, expect.anything())
})

test('Deploy actions should fail if there are no build files', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  expect(scripts.deployActions.bind(this)).toThrowWithMessageContaining(['build', 'missing'])
})
