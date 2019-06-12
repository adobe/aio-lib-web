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

const fs = require('fs-extra')
const CNAScripts = require('../..')
const utils = require('../../lib/utils')
const yaml = require('js-yaml')

const mockAIOConfig = require('@adobe/aio-cli-config')
utils.spawnAioRuntimeDeploy = jest.fn()

let scripts
let buildDir
beforeAll(async () => {
  await global.mockFS()
  // create test app
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  scripts = await CNAScripts()
  buildDir = scripts._config.actions.dist
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // clean build files
  await fs.remove(buildDir)
})

test('Deploy actions should generate a valid .manifest-dist.yml for 1 zip and 1 js action', async () => {
  await global.fakeFiles(buildDir, ['action.js', 'action-zip.zip'])
  await scripts.deployActions()

  const manifest = yaml.safeLoad(fs.readFileSync(scripts._config.manifest.dist, 'utf8'))
  // todo don't copy these fixture names
  expect(manifest.packages[scripts._config.ow.package]).toHaveProperty('actions.action')
  expect(manifest.packages[scripts._config.ow.package]).toHaveProperty('actions.action-zip')
})

test('Deploy actions should fail if there are no build files', async () => {
  expect(scripts.deployActions.bind(this)).toThrowWithMessageContaining(['build', 'missing'])
})
