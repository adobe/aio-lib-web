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

// mocks
jest.mock('parcel-bundler')
utils.installDeps = jest.fn()
// todo mock zip dependency instead of full utility for 100% coverage
utils.zipFolder = jest.fn((filePath, out) => fs.writeFileSync(out, 'mock content'))

const mockAIOConfig = require('@adobe/aio-lib-core-config')

afterEach(() => global.cleanFs(vol))
test('Build actions: 1 zip and 1 js', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  const scripts = await CNAScripts()
  const buildDir = scripts._config.actions.dist

  await scripts.buildActions()
  const buildFiles = fs.readdirSync(buildDir)
  expect(buildFiles.sort()).toEqual(['action-zip.zip', 'action.js'].sort())
})
