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
const path = require('path')

utils.spawnAioRuntimeDeploy = jest.fn()
let scripts
let appDir
let manifest
beforeAll(async () => {
  await global.mockFS()
  // create test app
  appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  await global.clearProcessEnv()
  scripts = await CNAScripts(appDir)
  manifest = scripts._config.manifest.dist
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // clean build files
  await fs.remove(scripts._config.manifest.dist)
})

test('Undeploy actions should remove .manifest-dist.yml', async () => {
  await global.fakeFiles('', [manifest])
  await scripts.undeployActions()
  expect(await fs.exists(manifest)).toBe(false)
})

test('Undeploy actions should fail if there is no deployment', async () => {
  // for now no deployment is simplified to no .dist-manifest.yml
  expect(scripts.undeployActions.bind(this)).toThrowWithMessageContaining(['missing', path.relative(appDir, manifest)])
})
