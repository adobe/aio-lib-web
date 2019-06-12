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
const mockAIOConfig = require('@adobe/aio-cli-config')

jest.mock('parcel-bundler')

let scripts
let buildDir
beforeAll(async () => {
  // mockFS
  await global.mockFS()
  // create test app
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  scripts = await CNAScripts()
  buildDir = scripts._config.web.distProd
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // cleanup build files
  await fs.remove(buildDir)
})

test('Build static files index.html', async () => {
  await scripts.buildUI()
  // make sure action and sequence urls are available to the UI
  const uiConfig = JSON.parse((await fs.readFile(scripts._config.web.injectedConfig)).toString())
  expect(uiConfig).toEqual(expect.objectContaining({
    action: expect.any(String),
    'action-zip': expect.any(String),
    'action-sequence': expect.any(String)
  }))
  const buildFiles = await fs.readdir(buildDir)
  expect(buildFiles.sort()).toEqual(['index.html'])
})
