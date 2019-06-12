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

// mocks
jest.mock('parcel-bundler')
utils.installDeps = jest.fn()
// we are mocking zipfolder because of mock-fs not working properly
// with streams, this might change in future versions of mock-fs
utils.zipFolder = jest.fn((dir, out) => fs.writeFile(out, 'mock content'))
const mockAIOConfig = require('@adobe/aio-cli-config')

let scripts
let buildDir
beforeAll(async () => {
  await global.mockFS()
  // create test app and switch cwd
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await CNAScripts()
  buildDir = scripts._config.actions.dist
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // cleanup build files
  await fs.remove(buildDir)
})

test('Build actions: 1 zip and 1 js', async () => {
  await scripts.buildActions()
  const buildFiles = await fs.readdir(buildDir)
  expect(buildFiles.sort()).toEqual(['action-zip.zip', 'action.js'].sort())
})
