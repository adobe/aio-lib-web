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

const CNAScripts = require('../..')
const utils = require('../../lib/utils')
const path = require('path')

utils.spawnAioRuntimeDeploy = jest.fn()
const mockAIOConfig = require('@adobe/aio-lib-core-config')

let scripts
let manifest
beforeEach(async () => {
  // create test app
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await CNAScripts()
  manifest = scripts._config.manifest.dist
})

afterEach(() => global.cleanFs(vol))

test('Undeploy actions should remove .manifest-dist.yml', async () => {
  await global.addFakeFiles(vol, '', [manifest])
  await scripts.undeployActions()
  expect(fs.existsSync(manifest)).toBe(false)
})

test('Undeploy actions should fail if there is no deployment', async () => {
  // for now no deployment is simplified to no .dist-manifest.yml
  expect(scripts.undeployActions.bind(this)).toThrowWithMessageContaining(['missing', path.basename(manifest)])
})
