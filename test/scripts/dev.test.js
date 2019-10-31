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

let scripts
beforeEach(async () => {
  // create test app and switch cwd
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await AppScripts({})
})

afterEach(() => global.cleanFs(vol))

describe('dev command is exported', () => {
  test('cna-scripts.runDev', () => {
    expect(scripts.runDev).toBeDefined()
    expect(typeof scripts.runDev).toBe('function')
  })
})

// Tests to write:
// Missing aio runtime config
// missing config.actions.remote
// missing config.app.hasFrontend
// fork: isLocal true/false
// isLocal -> no docker
// isLocal -> docker not running
// isLocal -> no java
// isLocal -> no whisk jar ... should download
// isLocal -> no whisk jar, no network, should fail
// isLocal - should backup .env file
// isLocal -> should write devConfig to .env
// isLocal -> should wait for whisk jar startup
// isLocal -> should fail if whisk jar startup timeouts

// should BuildActions with devConfig
// should DeployActions with devConfig
// should prepare wskprops for wskdebug
// should check for vscode, skip writing launch.json if it is not installed
// should backup launch.json
// should generate vs code debug config

// branch (ifHasFrontEnd)
// should gets entry file config.web.src + index.html
// should writes config for web (devConfig.actions.urls)
// should create express app
// should create parcel bundler, use as middleware
// should start express server
// on error, or process.SIGINT should call cleanup()

// - actions.remote
// - app.hasFrontend
// - web.src
// - web.distDev
// - process.env.PORT
