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
const path = require('path')

/* ****************** Mocks & beforeEach ******************* */
const execa = require('execa')
jest.mock('execa')

const express = require('express')
jest.mock('express')

const fetch = require('node-fetch')
jest.mock('node-fetch')

const Bundler = require('parcel-bundler')
jest.mock('parcel-bundler')

const BuildActions = require('../../scripts/build.actions')
const DeployActions = require('../../scripts/deploy.actions')
jest.mock('../../scripts/build.actions')
jest.mock('../../scripts/deploy.actions')

process.exit = jest.fn()
const mockOnProgress = jest.fn()

beforeEach(() => {
  global.cleanFs(vol)
  delete process.env.REMOTE_ACTIONS

  BuildActions.mockClear()
  DeployActions.mockClear()

  fetch.mockReset()
  execa.mockReset()

  express.mockReset()
  Bundler.mockReset()

  process.exit.mockReset()
  process.removeAllListeners('SIGINT')

  mockOnProgress.mockReset()
})

/* ****************** Helpers ******************* */

function writeFakeOwJar () {
  const owJarPath = path.resolve(__dirname, '../bin/openwhisk-standalone.jar')
  global.addFakeFiles(vol, path.dirname(owJarPath), path.basename(owJarPath))
}

async function loadEnvScripts (project, config, excludeFiles = []) {
  // create test app
  global.loadFs(vol, project)
  excludeFiles.forEach(f => vol.unlinkSync(f))
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts({ listeners: { onProgress: mockOnProgress } })
  return scripts
}

// helpers for checking good path
function expectDevActionBuildAndDeploy (expectedBuildDeployConfig) {
  // build & deploy
  expect(BuildActions).toHaveBeenCalledTimes(2)
  expect(BuildActions.mock.calls[1][0]).toEqual(expectedBuildDeployConfig)
  expect(BuildActions.mock.instances[1].run).toHaveBeenCalledTimes(1)
  expect(DeployActions).toHaveBeenCalledTimes(2)
  expect(DeployActions.mock.calls[1][0]).toEqual(expectedBuildDeployConfig)
  expect(DeployActions.mock.instances[1].run).toHaveBeenCalledTimes(1)
}

function expectUIServer (fakeMiddleware, port) {
  expect(express.mockConstructor).toHaveBeenCalledTimes(1)
  expect(Bundler.mockConstructor).toHaveBeenCalledTimes(1)

  expect(express.mockApp.use).toHaveBeenCalledWith(fakeMiddleware)
  expect(Bundler.mockConstructor).toHaveBeenCalledWith('/web-src/index.html', expect.objectContaining({
    watch: true,
    outDir: '/dist/web-src-dev'
  }))

  expect(express.mockApp.listen).toHaveBeenCalledWith(port)
}

function expectAppFiles (files) {
  expect(vol.readdirSync('/').sort()).toEqual(files.sort())
}

async function testCleanupNoErrors (done, scripts, postCleanupChecks) {
  // todo why do we need to remove listeners here, somehow the one in beforeEach isn't sufficient, is jest adding a listener?
  process.removeAllListeners('SIGINT')
  process.exit.mockImplementation(() => {
    postCleanupChecks()
    expect(process.exit).toHaveBeenCalledWith(0)
    done()
  })
  await scripts.runDev()
  expect(process.exit).toHaveBeenCalledTimes(0)
  // make sure we have only one listener = cleanup listener after each test + no pending promises
  expect(process.listenerCount('SIGINT')).toEqual(1)
  console.error = jest.fn()
  // send cleanup signal
  process.emit('SIGINT')
  console.error.mockRestore()
  // if test times out => means handler is not calling process.exit
}

async function testCleanupOnError (scripts, postCleanupChecks) {
  console.error = jest.fn()
  const error = new Error('fake')
  mockOnProgress.mockImplementation(msg => {
    // throw error for last progress statement
    // todo tests for intermediary progress steps aswell
    if (msg.includes('CTRL+C to terminate')) {
      throw error
    }
  })
  await expect(scripts.runDev()).rejects.toBe(error)
  postCleanupChecks()
}

const getExpectedActionVSCodeDebugConfig = actionName =>
  expect.objectContaining({
    type: 'node',
    request: 'launch',
    name: 'Action:' + actionName,
    runtimeExecutable: '/node_modules/.bin/wskdebug',
    env: { WSK_CONFIG_FILE: '/.wskdebug.props.tmp' },
    localRoot: '/',
    remoteRoot: '/code'
  })

const getExpectedUIVSCodeDebugConfig = uiPort => expect.objectContaining({
  type: 'chrome',
  request: 'launch',
  name: 'Web',
  url: `http://localhost:${uiPort}`,
  webRoot: '/web-src',
  breakOnLoad: true,
  sourceMapPathOverrides: {
    '*': '/dist/web-src-dev/*'
  }
})

/* ****************** Consts ******************* */

const execaLocalOWArgs = ['java', expect.arrayContaining(expect.stringContaining('openwhisk')), expect.anything()]

const expectedLocalOWConfig = expect.objectContaining({
  ow: expect.objectContaining({
    namespace: 'guest',
    auth: '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP',
    apihost: 'http://localhost:3233'
  })
})

const expectedRemoteOWConfig = expect.objectContaining({
  ow: expect.objectContaining({
    namespace: global.fakeConfig.tvm.runtime.namespace,
    auth: global.fakeConfig.tvm.runtime.auth,
    apihost: global.fakeConfig.tvm.runtime.apihost
  })
})

/* ****************** Tests ******************* */

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

function runCommonTests (ref) {
  test('should save a previous existing .vscode/config.json file to .vscode/config.json.save', async () => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    await ref.scripts.runDev()
    expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(true)
    expect(vol.readFileSync('/.vscode/launch.json.save').toString()).toEqual('fakecontent')
  })

  test('should not save to .vscode/config.json.save if there is no existing .vscode/config.json file', async () => {
    await ref.scripts.runDev()
    expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(false)
  })

  test('should cleanup generated files on SIGINT', async done => {
    await testCleanupNoErrors(done, ref.scripts, () => { expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions']) })
  })

  test('should cleanup and restore previous existing .vscode/config.json on SIGINT', async done => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    await testCleanupNoErrors(done, ref.scripts, () => {
      expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions', '.vscode'])
      expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(false)
      expect(vol.existsSync('/.vscode/launch.json')).toEqual(true)
      expect(vol.readFileSync('/.vscode/launch.json').toString()).toEqual('fakecontent')
    })
  })

  test('should cleanup generated files on error', async () => {
    await testCleanupOnError(ref.scripts, () => {
      expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions'])
    })
  })

  test('should cleanup and restore previous existing .vscode/config.json on error', async () => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    await testCleanupOnError(ref.scripts, () => {
      expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions', '.vscode'])
      expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(false)
      expect(vol.existsSync('/.vscode/launch.json')).toEqual(true)
      expect(vol.readFileSync('/.vscode/launch.json').toString()).toEqual('fakecontent')
    })
  })
}

function runCommonRemoteTests (ref) {
  test('should build and deploy actions to remote', async () => {
    await ref.scripts.runDev()
    expectDevActionBuildAndDeploy(expectedRemoteOWConfig)
  })

  test('should not start the local openwhisk stack', async () => {
    await ref.scripts.runDev()
    expect(execa).not.toHaveBeenCalledWith(...execaLocalOWArgs)
  })

  test('should generate a .wskdebug.props.tmp file with the remote credentials', async () => {
    await ref.scripts.runDev()
    const debugProps = vol.readFileSync('.wskdebug.props.tmp').toString()
    expect(debugProps).toEqual(expect.stringContaining(`NAMESPACE=${global.fakeConfig.tvm.runtime.namespace}`))
    expect(debugProps).toEqual(expect.stringContaining(`AUTH=${global.fakeConfig.tvm.runtime.auth}`))
    expect(debugProps).toEqual(expect.stringContaining(`APIHOST=${global.fakeConfig.tvm.runtime.apihost}`))
  })
}

function runCommonBackendOnlyTests (ref) {
  test('should not start a ui server', async () => {
    await ref.scripts.runDev()
    expect(express.mockConstructor).toHaveBeenCalledTimes(0)
    expect(Bundler.mockConstructor).toHaveBeenCalledTimes(0)
  })

  test('should generate a vscode config for actions only', async () => {
    await ref.scripts.runDev()
    expect(JSON.parse(vol.readFileSync('/.vscode/launch.json').toString())).toEqual(expect.objectContaining({
      configurations: [
        getExpectedActionVSCodeDebugConfig('sample-app-1.0.0/action'),
        getExpectedActionVSCodeDebugConfig('sample-app-1.0.0/action-zip')
        // fails if ui config
      ]
    }))
  })
}

function runCommonWithFrontendTests (ref) {
  test('should start a ui server', async () => {
    const fakeMiddleware = Symbol('fake middleware')
    Bundler.mockMiddleware.mockReturnValue(fakeMiddleware)
    await ref.scripts.runDev()
    expectUIServer(fakeMiddleware, 9080)
  })

  test('should generate a vscode debug config for actions and web-src', async () => {
    await ref.scripts.runDev()
    expect(JSON.parse(vol.readFileSync('/.vscode/launch.json').toString())).toEqual(expect.objectContaining({
      configurations: [
        getExpectedActionVSCodeDebugConfig('sample-app-1.0.0/action'),
        getExpectedActionVSCodeDebugConfig('sample-app-1.0.0/action-zip'),
        getExpectedUIVSCodeDebugConfig(9080)
      ]
    }))
  })

  test('should close the express server on sigint', async done => {
    const mockClose = jest.fn()
    express.mockApp.listen.mockReturnValue({ close: mockClose })
    await testCleanupNoErrors(done, ref.scripts, () => expect(mockClose).toHaveBeenCalledTimes(1))
  })

  test('should close the express server on error', async () => {
    const mockClose = jest.fn()
    express.mockApp.listen.mockReturnValue({ close: mockClose })
    await testCleanupOnError(ref.scripts, () => expect(mockClose).toHaveBeenCalledTimes(1))
  })

  test('should inject web-src/src/config.json into the UI', async () => {
    await ref.scripts.runDev()
    expect(vol.existsSync('/web-src/src/config.json')).toEqual(true)
  })
}

function runCommonLocalTests (ref) {
  test('fails if docker CLI is not installed', async () => {
    // add ow jar
    writeFakeOwJar()
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args.includes('-v')) {
        throw new Error('fake error')
      }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'could not find docker CLI, please make sure docker is installed' }))
  })

  test('fails if docker is not running', async () => {
    // add ow jar
    writeFakeOwJar()
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args.includes('info')) {
        throw new Error('fake error')
      }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'docker is not running, please make sure to start docker' }))
  })

  test('downloads openwhisk-standalone.jar on first usage', async () => {
    await ref.scripts.runDev()
    expect(fetch).toHaveBeenCalledWith('https://github.com/adobe/aio-app-scripts/raw/binaries/bin/openwhisk-standalone-0.10.jar')
  })
// fork: isLocal true/false
// isLocal -> no java install
// isLocal -> no whisk jar ... should download
// isLocal -> no whisk jar, no network, should fail
// isLocal - should backup .env file
// isLocal -> should write devConfig to .env
// isLocal -> should wait for whisk jar startup
// isLocal -> should fail if whisk jar startup timeouts
}

describe('with remote actions and no frontend', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'true'
    // remove '/web-src/index.html' file = no ui
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm, ['/web-src/index.html'])
  })

  runCommonTests(ref)
  runCommonRemoteTests(ref)
  runCommonBackendOnlyTests(ref)

  test('should start a dummy node background process to wait1 on sigint', async () => {
    await ref.scripts.runDev()
    expect(execa).toHaveBeenCalledWith('node')
  })

  test('should kill dummy node background process on sigint', async done => {
    const mockKill = jest.fn()
    execa.mockReturnValue({ kill: mockKill })
    await ref.scripts.runDev()
    await testCleanupNoErrors(done, ref.scripts, () => {
      expect(mockKill).toHaveBeenCalledTimes(1)
    })
  })

  test('should kill dummy node background process on error', async () => {
    const mockKill = jest.fn()
    execa.mockReturnValue({ kill: mockKill })
    await ref.scripts.runDev()
    await testCleanupOnError(ref.scripts, () => {
      expect(mockKill).toHaveBeenCalledTimes(1)
    })
  })
})

describe('with remote actions and frontend', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'true'
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm)
  })

  runCommonTests(ref)
  runCommonRemoteTests(ref)
  runCommonWithFrontendTests(ref)

  test('should inject remote action urls into the UI', async () => {
    await ref.scripts.runDev()
    expect(vol.existsSync('/web-src/src/config.json')).toEqual(true)
    expect(JSON.parse(vol.readFileSync('/web-src/src/config.json').toString())).toEqual({
      action: 'https://' + global.fakeConfig.tvm.runtime.namespace + '.' + global.fakeConfig.tvm.runtime.apihost.split('https://')[1] + '/api/v1/web/sample-app-1.0.0/action',
      'action-zip': 'https://' + global.fakeConfig.tvm.runtime.namespace + '.' + global.fakeConfig.tvm.runtime.apihost.split('https://')[1] + '/api/v1/web/sample-app-1.0.0/action-zip',
      'action-sequence': 'https://' + global.fakeConfig.tvm.runtime.namespace + '.' + global.fakeConfig.tvm.runtime.apihost.split('https://')[1] + '/api/v1/web/sample-app-1.0.0/action-sequence'
    })
  })
})

// describe('with local actions and no frontend', () => {
// const ref = {}
// beforeEach(async () => {
//   process.env.REMOTE_ACTIONS = 'false'
//   ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm, ['/web-src/index.html'])
// default mocks
// fetch.mockResolvedValue({
//   ok: true
// })
// execa.mockResolvedValue({
// stdout: jest.fn()
// })
// })

// runCommonTests(ref)
// runCommonLocalTests(ref)
// runCommonBackendOnlyTests(ref)
// })
// check java install

// Tests to write:
// Missing aio runtime config
// missing config.actions.remote
// missing config.app.hasFrontend
// fork: isLocal true/false
// isLocal -> no docker
// isLocal -> docker not running
// isLocal -> no java install
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
