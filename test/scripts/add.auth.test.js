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

const CNAScripts = require('../..')
const path = require('path')

// mocks
const mockAIOConfig = require('@adobe/aio-cli-config')
const mockFs = require('fs-extra')
jest.mock('fs-extra')
mockFs.readFileSync.mockReturnValue(`
packages:
  __CNA_PACKAGE__:
    license: Apache-2.0`)

let scripts
beforeAll(async () => {
  // create test app and switch cwd
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await CNAScripts({})
})

test('Sanity test', async () => {
  await scripts.addAuth({}, path.resolve('./manifest.yml'))
  expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
})
