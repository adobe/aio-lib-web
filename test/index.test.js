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

const CNAScripts = require('../index')
const utils = require('../lib/utils')

const mockAIOConfig = require('@adobe/aio-lib-core-config')
utils.spawnAioRuntimeDeploy = jest.fn()

let mockListener
beforeEach(async () => {
  // create test app and switch cwd
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  mockListener = {
    onStart: jest.fn(),
    onEnd: jest.fn(),
    onProgress: jest.fn(),
    onResource: jest.fn(),
    onWarning: jest.fn()
  }
})

afterEach(() => global.cleanFs(vol))

describe('CNAScripts has expected interface ', () => {
  test('Load CNAScripts without listener', async () => {
    const scripts = CNAScripts()
    expect(scripts).toBeDefined()
    expect(scripts).toEqual(global.expectedScripts)
  })

  test('Load CNAScripts with listener', async () => {
    const scripts = CNAScripts({ listeners: mockListener })

    expect(scripts).toBeDefined()
    expect(scripts).toEqual(global.expectedScripts)
  })
})
