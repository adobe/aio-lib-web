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
const cloneDeep = require('lodash.clonedeep')

// mocks
const execa = require('execa')
jest.mock('execa')

const express = require('express')
jest.mock('express')

const fetch = require('node-fetch')
jest.mock('node-fetch')

// const bundler = require('parcel-bundler')
jest.mock('parcel-bundler')

const BuildActions = require('../../scripts/build.actions')
const DeployActions = require('../../scripts/deploy.actions')
jest.mock('../../scripts/build.actions')
jest.mock('../../scripts/deploy.actions')

beforeEach(async () => {
  global.cleanFs(vol)
  delete process.env.REMOTE_ACTIONS

  BuildActions.mockClear()
  DeployActions.mockClear()

  fetch.mockReset()
  execa.mockReset()
  // bundler.mockReset() todo
  express.mockReset()
})

async function loadEnvScripts (project, config, excludeFiles = []) {
  // create test app
  global.loadFs(vol, project)
  excludeFiles.forEach(f => vol.unlinkSync(f))
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts({})
  return scripts
}

test('cna-scripts.runDev command is exported', async () => {
  const scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm)
  expect(scripts.runDev).toBeDefined()
  expect(typeof scripts.runDev).toBe('function')
})

describe('config fail if', () => {
  const failMissingRuntimeConfig = async (configVarName, remoteActionsValue) => {
    process.env.REMOTE_ACTIONS = remoteActionsValue
    const config = cloneDeep(global.fakeConfig.tvm) // don't override original
    delete config.runtime[configVarName]
    const scripts = await loadEnvScripts('sample-app', config)
    await expect(scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining(`missing Adobe I/O Runtime ${configVarName}`) }))
  }
  test('missing runtime namespace and REMOTE_ACTIONS=true', () => failMissingRuntimeConfig('namespace', 'true'))
  test('missing runtime namespace and REMOTE_ACTIONS=yes', () => failMissingRuntimeConfig('namespace', 'yes'))
  test('missing runtime namespace and REMOTE_ACTIONS=1', () => failMissingRuntimeConfig('namespace', '1'))

  test('missing runtime apihost and REMOTE_ACTIONS=true', () => failMissingRuntimeConfig('apihost', 'true'))
  test('missing runtime apihost and REMOTE_ACTIONS=yes', () => failMissingRuntimeConfig('apihost', 'yes'))
  test('missing runtime apihost and REMOTE_ACTIONS=1', () => failMissingRuntimeConfig('apihost', '1'))

  test('missing runtime auth and REMOTE_ACTIONS=true', () => failMissingRuntimeConfig('auth', 'true'))
  test('missing runtime auth and REMOTE_ACTIONS=yes', () => failMissingRuntimeConfig('auth', 'yes'))
  test('missing runtime auth and REMOTE_ACTIONS=1', () => failMissingRuntimeConfig('auth', '1'))
})

describe('run dev when remote actions is set', () => {
  const expectedBuildDeployConfig = expect.objectContaining({
    ow: expect.objectContaining({
      namespace: global.fakeConfig.tvm.runtime.namespace,
      auth: global.fakeConfig.tvm.runtime.auth
    })
  })

  test('when the app does not have a frontend', async () => {
    process.env.REMOTE_ACTIONS = 'true'
    const scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm, ['/web-src/index.html'])
    await scripts.runDev()
    // build &deploy
    // runDev re-imports the scripts (todo make reuse existing ones)
    expect(BuildActions).toHaveBeenCalledTimes(2)
    expect(BuildActions.mock.calls[1][0]).toEqual(expectedBuildDeployConfig)
    expect(BuildActions.mock.instances[1].run).toHaveBeenCalledTimes(1)

    expect(DeployActions).toHaveBeenCalledTimes(2)
    expect(DeployActions.mock.calls[1][0]).toEqual(expectedBuildDeployConfig)
    expect(DeployActions.mock.instances[1].run).toHaveBeenCalledTimes(1)

    // check mocks
    // todo more checks + more meaningful mocks
    expect(execa).toHaveBeenCalledTimes(0) // no execa calls expected
    expect(fetch).toHaveBeenCalledTimes(0)
    expect(express).toHaveBeenCalledTimes(0)
    // expect(bundler).toHaveBeenCalledTimes(0) // todo
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
