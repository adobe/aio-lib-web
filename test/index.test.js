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

const CNAScripts = require('../index')
const utils = require('../lib/utils')
const fs = require('fs-extra')

const mockAIOConfig = require('@adobe/aio-lib-core-config')
utils.spawnAioRuntimeDeploy = jest.fn()

let scripts
let buildDir
let mockListener

beforeAll(async () => {
  await global.mockFS()
  // create test app
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  scripts = await CNAScripts()
  buildDir = scripts._config.actions.dist
})

beforeEach(() => {
  mockListener = {
    onStart: jest.fn(),
    onEnd: jest.fn(),
    onProgress: jest.fn(),
    onResource: jest.fn(),
    onWarning: jest.fn()
  }
})

afterAll(async () => {
  await global.resetFS()
})

afterEach(async () => {
  // clean build files
  await fs.remove(buildDir)
})

describe('CNAScripts has expected interface ', () => {
  test('Load CNAScripts without listener', async () => {
    let scripts = CNAScripts()
    expect(scripts).toBeDefined()
    // buildUI
    expect(scripts.buildUI).toBeDefined()
    expect(typeof scripts.buildUI).toBe('function')
    // buildActions
    expect(scripts.buildActions).toBeDefined()
    expect(typeof scripts.buildActions).toBe('function')
    // deployUI
    expect(scripts.deployUI).toBeDefined()
    expect(typeof scripts.deployUI).toBe('function')
    // deployActions
    expect(scripts.deployActions).toBeDefined()
    expect(typeof scripts.deployActions).toBe('function')
    // undeployUI
    expect(scripts.undeployUI).toBeDefined()
    expect(typeof scripts.undeployUI).toBe('function')
    // undeployActions
    expect(scripts.undeployActions).toBeDefined()
    expect(typeof scripts.undeployActions).toBe('function')
    // runDev
    expect(scripts.runDev).toBeDefined()
    expect(typeof scripts.runDev).toBe('function')
    // addAuth
    expect(scripts.addAuth).toBeDefined()
    expect(typeof scripts.addAuth).toBe('function')
  })

  test('Load CNAScripts with listener', async () => {
    let scripts = CNAScripts({ listeners: mockListener })

    expect(scripts).toBeDefined()
    // buildUI
    expect(scripts.buildUI).toBeDefined()
    expect(typeof scripts.buildUI).toBe('function')
    // buildActions
    expect(scripts.buildActions).toBeDefined()
    expect(typeof scripts.buildActions).toBe('function')
    // deployUI
    expect(scripts.deployUI).toBeDefined()
    expect(typeof scripts.deployUI).toBe('function')
    // deployActions
    expect(scripts.deployActions).toBeDefined()
    expect(typeof scripts.deployActions).toBe('function')
    // undeployUI
    expect(scripts.undeployUI).toBeDefined()
    expect(typeof scripts.undeployUI).toBe('function')
    // undeployActions
    expect(scripts.undeployActions).toBeDefined()
    expect(typeof scripts.undeployActions).toBe('function')
    // runDev
    expect(scripts.runDev).toBeDefined()
    expect(typeof scripts.runDev).toBe('function')
    // addAuth
    expect(scripts.addAuth).toBeDefined()
    expect(typeof scripts.addAuth).toBe('function')
  })
})
