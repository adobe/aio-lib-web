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
const cloneDeep = require('lodash.clonedeep')
const path = require('path')
const stream = require('stream')
const mockAIOConfig = require('@adobe/aio-lib-core-config')
const util = require('util')
const sleep = util.promisify(setTimeout)

/* ****************** Mocks & beforeEach ******************* */
let onChangeFunc
jest.mock('chokidar', () => {
  return {
    watch: (...watchArgs) => {
      return {
        on: (status, method) => {
          onChangeFunc = method
        },
        close: jest.fn()
      }
    }
  }
})

const execa = require('execa')
jest.mock('execa')

const fetch = require('node-fetch')
jest.mock('node-fetch')

const Bundler = require('parcel-bundler')
jest.mock('parcel-bundler')

const BuildActions = require('../../scripts/build.actions')
const DeployActions = require('../../scripts/deploy.actions')
jest.mock('../../scripts/build.actions')
jest.mock('../../scripts/deploy.actions')

let deployActionsSpy

process.exit = jest.fn()
const mockOnProgress = jest.fn()

const actualSetTimeout = setTimeout
const now = Date.now
let time

beforeEach(() => {
  global.cleanFs(vol)
  delete process.env.REMOTE_ACTIONS

  BuildActions.mockClear()
  DeployActions.mockClear()

  fetch.mockReset()
  execa.mockReset()

  Bundler.mockReset()

  process.exit.mockReset()
  process.removeAllListeners('SIGINT')

  mockOnProgress.mockReset()

  // workaround for timers and elapsed time
  // to replace when https://github.com/facebook/jest/issues/5165 is closed
  Date.now = jest.fn()
  global.setTimeout = jest.fn()
  time = now()
  Date.now.mockImplementation(() => time)
  global.setTimeout.mockImplementation((fn, d) => { time = time + d; fn() })

  deployActionsSpy = jest.spyOn(DeployActions.prototype, 'run')
  deployActionsSpy.mockResolvedValue({})
})

afterAll(() => {
  deployActionsSpy.mockRestore()
})

/* ****************** Consts ******************* */

const localOWCredentials = {
  ...global.fakeConfig.local.runtime
}

const remoteOWCredentials = {
  ...global.fakeConfig.tvm.runtime,
  apihost: global.defaultOwApiHost
}

const expectedLocalOWConfig = expect.objectContaining({
  ow: expect.objectContaining({
    ...localOWCredentials
  })
})

const expectedRemoteOWConfig = expect.objectContaining({
  ow: expect.objectContaining({
    ...remoteOWCredentials
  })
})

// those must match the ones defined in dev.js
const owJarPath = path.resolve(__dirname, '../../bin/openwhisk-standalone.jar')
const owJarUrl = 'https://github.com/adobe/aio-app-scripts/raw/binaries/bin/openwhisk-standalone-0.10.jar'
const waitInitTime = 2000
const waitPeriodTime = 500

const execaLocalOWArgs = ['java', expect.arrayContaining(['-jar', r(owJarPath)]), expect.anything()]

/* ****************** Helpers ******************* */
function generateDotenvContent (credentials) {
  let content = ''
  if (credentials.namespace) content = content + `AIO_RUNTIME_NAMESPACE=${credentials.namespace}`
  if (credentials.auth) content = content + `\nAIO_RUNTIME_AUTH=${credentials.auth}`
  if (credentials.apihost) content = content + `\nAIO_RUNTIME_APIHOST=${credentials.apihost}`
  return content
}

async function loadEnvScripts (project, config, excludeFiles = []) {
  // create test app
  global.loadFs(vol, project)
  excludeFiles.forEach(f => vol.unlinkSync(f))
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts({ listeners: { onProgress: mockOnProgress } })
  return scripts
}

function writeFakeOwJar () {
  global.addFakeFiles(vol, path.dirname(owJarPath), path.basename(owJarPath))
}

function deleteFakeOwJar () {
  const parts = owJarPath.split('/').slice(1) // slice(1) to remove first empty '' because of path starting with /
  vol.unlinkSync(owJarPath)
  parts.pop()
  while (parts.length > 0) {
    vol.rmdirSync('/' + parts.join('/'))
    parts.pop()
  }
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
  expect(Bundler.mockConstructor).toHaveBeenCalledTimes(1)

  expect(Bundler.mockConstructor).toHaveBeenCalledWith(r('/web-src/index.html'),
    expect.objectContaining({
      watch: true,
      outDir: r('/dist/web-src-dev')
    }))
}

function expectAppFiles (expectedFiles) {
  expectedFiles = new Set(expectedFiles)
  const files = new Set(vol.readdirSync('/'))
  // in run local, the openwhisk standalone jar is created at __dirname,
  // but as we store the app in the root of the memfs, we need to ignore the extra created folder
  files.delete(owJarPath.split(path.sep)[1])
  expect(files).toEqual(expectedFiles)
}

async function testCleanupNoErrors (done, scripts, postCleanupChecks) {
  // todo why do we need to remove listeners here, somehow the one in beforeEach isn't sufficient, is jest adding a listener?
  process.removeAllListeners('SIGINT')
  process.exit.mockImplementation(() => {
    console.error = consoleerror
    postCleanupChecks()
    expect(process.exit).toHaveBeenCalledWith(0)
    done()
  })
  await scripts.runDev()
  expect(process.exit).toHaveBeenCalledTimes(0)
  // make sure we have only one listener = cleanup listener after each test + no pending promises
  expect(process.listenerCount('SIGINT')).toEqual(1)
  const consoleerror = console.error
  console.error = jest.fn()
  // send cleanup signal
  process.emit('SIGINT')
  // if test times out => means handler is not calling process.exit
}

async function testCleanupOnError (scripts, postCleanupChecks) {
  const consoleerror = console.error
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
  console.error = consoleerror
  postCleanupChecks()
}

const getExpectedActionVSCodeDebugConfig = actionName =>
  expect.objectContaining({
    type: 'node',
    request: 'launch',
    name: 'Action:' + actionName,
    runtimeExecutable: r('/node_modules/.bin/wskdebug'),
    env: { WSK_CONFIG_FILE: r('/.wskdebug.props.tmp') },
    localRoot: r('/'),
    remoteRoot: '/code'
  })

const getExpectedUIVSCodeDebugConfig = uiPort => expect.objectContaining({
  type: 'chrome',
  request: 'launch',
  name: 'Web',
  url: `http://localhost:${uiPort}`,
  webRoot: r('/web-src'),
  breakOnLoad: true,
  sourceMapPathOverrides: {
    '*': r('/dist/web-src-dev/*')
  }
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

  test('missing runtime namespace and REMOTE_ACTIONS=true', () => failMissingRuntimeConfig('namespace', 'true')) // eslint-disable-line jest/expect-expect
  test('missing runtime namespace and REMOTE_ACTIONS=yes', () => failMissingRuntimeConfig('namespace', 'yes')) // eslint-disable-line jest/expect-expect
  test('missing runtime namespace and REMOTE_ACTIONS=1', () => failMissingRuntimeConfig('namespace', '1')) // eslint-disable-line jest/expect-expect

  test('missing runtime auth and REMOTE_ACTIONS=true', () => failMissingRuntimeConfig('auth', 'true')) // eslint-disable-line jest/expect-expect
  test('missing runtime auth and REMOTE_ACTIONS=yes', () => failMissingRuntimeConfig('auth', 'yes')) // eslint-disable-line jest/expect-expect
  test('missing runtime auth and REMOTE_ACTIONS=1', () => failMissingRuntimeConfig('auth', '1')) // eslint-disable-line jest/expect-expect
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

  test('should not overwrite .vscode/config.json.save', async () => {
    // why? because it might be because previous restore failed
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    global.addFakeFiles(vol, '.vscode', { 'launch.json.save': 'fakecontentsaved' })
    await ref.scripts.runDev()
    expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(true)
    expect(vol.readFileSync('/.vscode/launch.json.save').toString()).toEqual('fakecontentsaved')
  })

  // eslint-disable-next-line jest/expect-expect
  test('should cleanup generated files on SIGINT', async () => {
    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => { expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions']) })
    })
  })

  // eslint-disable-next-line jest/expect-expect
  test('should cleanup generated files on error', async () => {
    await testCleanupOnError(ref.scripts, () => {
      expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions'])
    })
  })

  test('should cleanup and restore previous existing .vscode/config.json on SIGINT', async () => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => {
        expectAppFiles(['manifest.yml', 'package.json', 'web-src', 'actions', '.vscode'])
        expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(false)
        expect(vol.existsSync('/.vscode/launch.json')).toEqual(true)
        expect(vol.readFileSync('/.vscode/launch.json').toString()).toEqual('fakecontent')
      })
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

  test('should not remove previously existing ./vscode/launch.json.save on SIGINT', async () => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    global.addFakeFiles(vol, '.vscode', { 'launch.json.save': 'fakecontentsaved' })
    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => {
        expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(true)
        expect(vol.readFileSync('/.vscode/launch.json.save').toString()).toEqual('fakecontentsaved')
      })
    })
  })

  test('should not remove previously existing ./vscode/launch.json.save on error', async () => {
    global.addFakeFiles(vol, '.vscode', { 'launch.json': 'fakecontent' })
    global.addFakeFiles(vol, '.vscode', { 'launch.json.save': 'fakecontentsaved' })
    await testCleanupOnError(ref.scripts, () => {
      expect(vol.existsSync('/.vscode/launch.json.save')).toEqual(true)
      expect(vol.readFileSync('/.vscode/launch.json.save').toString()).toEqual('fakecontentsaved')
    })
  })

  test('should log actions url or name when actions are deployed', async () => {
    deployActionsSpy.mockResolvedValue({
      actions: [
        { name: 'pkg/action', url: 'https://fake.com/action' },
        { name: 'pkg/actionNoUrl' }
      ]
    })

    await ref.scripts.runDev()

    expect(mockOnProgress).toHaveBeenCalledWith(expect.stringContaining('pkg/actionNoUrl'))
    expect(mockOnProgress).toHaveBeenCalledWith(expect.stringContaining('https://fake.com/action'))
  })
}

function runCommonRemoteTests (ref) {
  // eslint-disable-next-line jest/expect-expect
  test('should build and deploy actions to remote', async () => {
    DeployActions.prototype.run.mockImplementation(async () => { await sleep(2000); return {} })
    await ref.scripts.runDev()
    expectDevActionBuildAndDeploy(expectedRemoteOWConfig)

    BuildActions.mockClear()
    DeployActions.mockClear()

    // First change
    onChangeFunc('changed')
    await sleep(200)
    DeployActions.prototype.run.mockImplementation(async () => { throw new Error() })

    // Second change after 200 ms
    onChangeFunc('changed')
    await sleep(1000)

    // Second change should not have resulted in build & deploy yet because first deploy would take 2 secs
    expect(BuildActions).toHaveBeenCalledTimes(1)
    expect(DeployActions).toHaveBeenCalledTimes(1)
    await sleep(4000)

    // The second call to DeployActions will result in an error because of the second mock above
    expect(mockOnProgress).toHaveBeenCalledWith(expect.stringContaining('Stopping'))
    expect(BuildActions).toHaveBeenCalledTimes(2)
    expect(BuildActions.mock.instances[0].run).toHaveBeenCalledTimes(1)
    expect(DeployActions).toHaveBeenCalledTimes(2)
    expect(DeployActions.mock.instances[0].run).toHaveBeenCalledTimes(1)
  })

  test('should not start the local openwhisk stack', async () => {
    await ref.scripts.runDev()
    expect(execa).not.toHaveBeenCalledWith(...execaLocalOWArgs)
  })

  test('should generate a .wskdebug.props.tmp file with the remote credentials', async () => {
    await ref.scripts.runDev()
    const debugProps = vol.readFileSync('.wskdebug.props.tmp').toString()
    expect(debugProps).toContain(`NAMESPACE=${remoteOWCredentials.namespace}`)
    expect(debugProps).toContain(`AUTH=${remoteOWCredentials.auth}`)
    expect(debugProps).toContain(`APIHOST=${remoteOWCredentials.apihost}`)
  })
}

function runCommonBackendOnlyTests (ref) {
  test('should not start a ui server', async () => {
    await ref.scripts.runDev()
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
  // eslint-disable-next-line jest/expect-expect
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
}

function runCommonLocalTests (ref) {
  test('should fail if java is not installed', async () => {
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'java') {
        throw new Error('fake error')
      }
      return { stdout: jest.fn() }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'could not find java CLI, please make sure java is installed' }))
  })

  test('should fail if docker CLI is not installed', async () => {
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args.includes('-v')) {
        throw new Error('fake error')
      }
      return { stdout: jest.fn() }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'could not find docker CLI, please make sure docker is installed' }))
  })

  test('should fail if docker is not running', async () => {
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args.includes('info')) {
        throw new Error('fake error')
      }
      return { stdout: jest.fn() }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'docker is not running, please make sure to start docker' }))
  })

  test('should download openwhisk-standalone.jar on first usage', async () => {
    // there seems to be a bug with memfs streams + mock timeouts
    // Error [ERR_UNHANDLED_ERROR]: Unhandled error. (Error: EBADF: bad file descriptor, close)
    // so disabling mocks for this test only, with the consequence of taking 2 seconds to run
    // !!!! todo fix and use timer mocks to avoid bugs in new tests + performance !!!!
    global.setTimeout = actualSetTimeout
    Date.now = now

    deleteFakeOwJar()
    const streamBuffer = ['fake', 'ow', 'jar', null]
    const fakeOwJarStream = stream.Readable({
      read: function () {
        this.push(streamBuffer.shift())
      },
      emitClose: true
    })
    fetch.mockResolvedValue({
      ok: true,
      body: fakeOwJarStream
    })

    await ref.scripts.runDev()

    expect(fetch).toHaveBeenCalledWith(owJarUrl)
    expect(vol.existsSync(owJarPath)).toEqual(true)
    expect(vol.readFileSync(owJarPath).toString()).toEqual('fakeowjar')
  })

  test('should fail if downloading openwhisk-standalone.jar creates a stream error', async () => {
    // restore timeouts see above
    global.setTimeout = actualSetTimeout
    Date.now = now

    deleteFakeOwJar()
    const fakeOwJarStream = stream.Readable({
      read: function () {
        this.emit('error', new Error('fake stream error'))
      },
      emitClose: true
    })
    fetch.mockResolvedValue({
      ok: true,
      body: fakeOwJarStream
    })

    await expect(ref.scripts.runDev()).rejects.toThrow('fake stream error')
  })

  test('should fail when there is a connection error while downloading openwhisk-standalone.jar on first usage', async () => {
    deleteFakeOwJar()
    fetch.mockRejectedValue(new Error('fake connection error'))
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: `connection error while downloading '${owJarUrl}', are you online?` }))
  })

  test('should fail if fetch fails to download openwhisk-standalone.jar on first usage because of status error', async () => {
    deleteFakeOwJar()
    fetch.mockResolvedValue({
      ok: false,
      statusText: 404
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: `unexpected response while downloading '${owJarUrl}': 404` }))
  })

  // eslint-disable-next-line jest/expect-expect
  test('should build and deploy actions to local ow', async () => {
    DeployActions.prototype.run.mockImplementation(async () => { await sleep(2000); return {} })
    await ref.scripts.runDev()
    expectDevActionBuildAndDeploy(expectedLocalOWConfig)

    BuildActions.mockClear()
    DeployActions.mockClear()
    // First change
    onChangeFunc('changed')
    await sleep(200)
    DeployActions.prototype.run.mockImplementation(async () => { throw new Error() })

    // Second change after 200 ms
    onChangeFunc('changed')
    await sleep(1000)

    // Second change should not have resulted in build & deploy yet because first deploy would take 2 secs
    expect(BuildActions).toHaveBeenCalledTimes(1)
    expect(DeployActions).toHaveBeenCalledTimes(1)
    await sleep(4000)

    // The second call to DeployActions will result in an error because of the second mock above
    expect(mockOnProgress).toHaveBeenCalledWith(expect.stringContaining('Stopping'))
    expect(BuildActions).toHaveBeenCalledTimes(2)
    expect(BuildActions.mock.instances[0].run).toHaveBeenCalledTimes(1)
    expect(DeployActions).toHaveBeenCalledTimes(2)
    expect(DeployActions.mock.instances[0].run).toHaveBeenCalledTimes(1)
  })

  test('should create a tmp .env file with local openwhisk credentials if there is no existing .env', async () => {
    await ref.scripts.runDev()
    expect(vol.existsSync('/.env')).toBe(true)
    const dotenvContent = vol.readFileSync('/.env').toString()
    expect(dotenvContent).toContain(generateDotenvContent(localOWCredentials))
  })

  test('should backup an existing .env and create a new .env with local openwhisk credentials', async () => {
    vol.writeFileSync('/.env', generateDotenvContent(remoteOWCredentials))
    await ref.scripts.runDev()
    // 1. make sure the new .env is still written properly
    expect(vol.existsSync('/.env')).toBe(true)
    const dotenvContent = vol.readFileSync('/.env').toString()
    expect(dotenvContent).toContain(generateDotenvContent(localOWCredentials))
    // 2. check that saved file has old content
    expect(vol.existsSync('/.env.app.save')).toBe(true)
    const dotenvSaveContent = vol.readFileSync('/.env.app.save').toString()
    expect(dotenvSaveContent).toEqual(generateDotenvContent(remoteOWCredentials))
  })

  test('should fail backup an existing .env if .env.save already exists', async () => {
    vol.writeFileSync('/.env', generateDotenvContent(remoteOWCredentials))
    vol.writeFileSync('/.env.app.save', 'fake content')
    await expect(ref.scripts.runDev()).rejects.toThrow(`cannot save .env, please make sure to restore and delete ${r('/.env.app.save')}`)
    expect(vol.readFileSync('/.env.app.save').toString()).toEqual('fake content')
  })

  test('should take additional variables from existing .env and plug them into new .env with local openwhisk credentials', async () => {
    const dotenvOldContent = generateDotenvContent(remoteOWCredentials) + `
AIO_RUNTIME_MORE=hello
AIO_CNA_TVMURL=yolo
MORE_VAR_1=hello2
`
    vol.writeFileSync('/.env', dotenvOldContent)

    await ref.scripts.runDev()
    // 1. make sure the new .env is still written properly
    expect(vol.existsSync('/.env')).toBe(true)
    const dotenvContent = vol.readFileSync('/.env').toString()
    expect(dotenvContent).toContain(generateDotenvContent(localOWCredentials))
    // 2. make sure the new .env include additional variables
    expect(dotenvContent).toContain('AIO_RUNTIME_MORE=hello')
    expect(dotenvContent).toContain('AIO_CNA_TVMURL=yolo')
    expect(dotenvContent).toContain('MORE_VAR_1=hello2')
    // 3. check that saved file has old content
    expect(vol.existsSync('/.env.app.save')).toBe(true)
    const dotenvSaveContent = vol.readFileSync('/.env.app.save').toString()
    expect(dotenvSaveContent).toEqual(dotenvOldContent)
  })

  test('should restore .env file on SIGINT', async () => {
    const dotenvOldContent = generateDotenvContent(remoteOWCredentials) + `
AIO_RUNTIME_MORE=hello
AIO_CNA_TVMURL=yolo
MORE_VAR_1=hello2
`
    vol.writeFileSync('/.env', dotenvOldContent)

    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => {
        expect(vol.existsSync('/.env.app.save')).toBe(false)
        expect(vol.existsSync('/.env')).toBe(true)
        const dotenvContent = vol.readFileSync('/.env').toString()
        expect(dotenvContent).toEqual(dotenvOldContent)
      })
    })
  })

  test('should restore .env file on error', async () => {
    const dotenvOldContent = generateDotenvContent(remoteOWCredentials) + `
AIO_RUNTIME_MORE=hello
AIO_CNA_TVMURL=yolo
MORE_VAR_1=hello2
`
    vol.writeFileSync('/.env', dotenvOldContent)

    await testCleanupOnError(ref.scripts, () => {
      expect(vol.existsSync('/.env.app.save')).toBe(false)
      expect(vol.existsSync('/.env')).toBe(true)
      const dotenvContent = vol.readFileSync('/.env').toString()
      expect(dotenvContent).toEqual(dotenvOldContent)
    })
  })

  test('should start openwhisk-standalone jar', async () => {
    await ref.scripts.runDev()
    expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
  })

  test('should kill openwhisk-standalone subprocess on SIGINT', async () => {
    const owProcessMockKill = jest.fn()
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'java' && args.includes('-jar') && args.includes(owJarPath)) {
        return {
          stdout: jest.fn(),
          kill: owProcessMockKill
        }
      }
      return {
        stdout: jest.fn(),
        kill: jest.fn()
      }
    })
    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => {
        expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
        expect(owProcessMockKill).toHaveBeenCalledTimes(1)
      })
    })
  })

  test('should kill openwhisk-standalone subprocess on error', async () => {
    const owProcessMockKill = jest.fn()
    execa.mockImplementation((cmd, args) => {
      if (cmd === 'java' && args.includes('-jar') && args.includes(owJarPath)) {
        return {
          stdout: jest.fn(),
          kill: owProcessMockKill
        }
      }
      return {
        stdout: jest.fn(),
        kill: jest.fn()
      }
    })
    await testCleanupOnError(ref.scripts, () => {
      expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
      expect(owProcessMockKill).toHaveBeenCalledTimes(1)
    })
  })

  test('should wait for local openwhisk-standalone jar startup', async () => {
    let waitSteps = 4
    fetch.mockImplementation(async url => {
      if (url === 'http://localhost:3233/api/v1') {
        if (waitSteps > 3) {
          // fake first call connection error
          waitSteps--
          throw new Error('connection error')
        }
        if (waitSteps > 0) {
          // fake some calls status error
          waitSteps--
          return { ok: false }
        }
      }
      return { ok: true }
    })

    await ref.scripts.runDev()
    expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3233/api/v1')
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitInitTime) // initial wait
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitPeriodTime) // period wait
    expect(setTimeout).toHaveBeenCalledTimes(5)
  })

  test('should fail if local openwhisk-standalone jar startup takes 61seconds', async () => {
    const initialTime = Date.now() // fake Date.now() only increases with setTimeout, see beginning of this file
    fetch.mockImplementation(async url => {
      if (url === 'http://localhost:3233/api/v1') {
        if (Date.now() < initialTime + 61000) return { ok: false }
      }
      return { ok: true }
    })
    await expect(ref.scripts.runDev()).rejects.toEqual(expect.objectContaining({ message: 'local openwhisk stack startup timed out: 60000ms' }))
    expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3233/api/v1')
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitInitTime) // initial wait
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitPeriodTime) // period wait
  })

  test('should run if local openwhisk-standalone jar startup takes 59seconds', async () => {
    const initialTime = Date.now() // fake Date.now() only increases with setTimeout, see beginning of this file
    fetch.mockImplementation(async url => {
      if (url === 'http://localhost:3233/api/v1') {
        if (Date.now() < initialTime + 59000) return { ok: false }
      }
      return { ok: true }
    })
    await ref.scripts.runDev()
    expect(execa).toHaveBeenCalledWith(...execaLocalOWArgs)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3233/api/v1')
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitInitTime) // initial wait
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), waitPeriodTime) // period wait
  })
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

  test('should kill dummy node background process on sigint', async () => {
    const mockKill = jest.fn()
    execa.mockReturnValue({ kill: mockKill })
    await ref.scripts.runDev()
    return new Promise(resolve => {
      testCleanupNoErrors(resolve, ref.scripts, () => {
        expect(mockKill).toHaveBeenCalledTimes(1)
      })
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
    const baseUrl = 'https://' + remoteOWCredentials.namespace + '.' + global.defaultOwApiHost.split('https://')[1] + '/api/v1/web/sample-app-1.0.0/'
    expect(JSON.parse(vol.readFileSync('/web-src/src/config.json').toString())).toEqual({
      action: baseUrl + 'action',
      'action-zip': baseUrl + 'action-zip',
      'action-sequence': baseUrl + 'action-sequence'
    })
  })

  test('should use https cert/key if passed', async () => {
    const httpsConfig = { https: { cert: 'cert.cert', key: 'key.key' } }
    const port = 8888
    await ref.scripts.runDev([port], httpsConfig)
    expect(Bundler.mockServe).toHaveBeenCalledWith(port, httpsConfig.https)
  })
})

describe('with local actions and no frontend', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'false'
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm, ['/web-src/index.html'])
    // default mocks
    // assume ow jar is already downloaded
    writeFakeOwJar()
    execa.mockReturnValue({
      stdout: jest.fn(),
      kill: jest.fn()
    })
    fetch.mockResolvedValue({
      ok: true
    })
    // should expose a new config with local credentials when reloaded in the dev cmd
    // we could also not mock aioConfig and expect it to read from .env
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.local)
  })

  runCommonTests(ref)
  runCommonBackendOnlyTests(ref)
  runCommonLocalTests(ref)
})

describe('with local actions and frontend', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'false'
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm)
    // default mocks
    // assume ow jar is already downloaded
    writeFakeOwJar()
    execa.mockReturnValue({
      stdout: jest.fn(),
      kill: jest.fn()
    })
    fetch.mockResolvedValue({
      ok: true
    })
    // should expose a new config with local credentials when reloaded in the dev cmd
    // we could also not mock aioConfig and expect it to read from .env
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.local)
  })

  runCommonTests(ref)
  runCommonWithFrontendTests(ref)
  runCommonLocalTests(ref)

  test('should inject local action urls into the UI', async () => {
    await ref.scripts.runDev()
    expect(vol.existsSync('/web-src/src/config.json')).toEqual(true)
    const baseUrl = localOWCredentials.apihost + '/api/v1/web/' + localOWCredentials.namespace + '/sample-app-1.0.0/'
    expect(JSON.parse(vol.readFileSync('/web-src/src/config.json').toString())).toEqual({
      action: baseUrl + 'action',
      'action-zip': baseUrl + 'action-zip',
      'action-sequence': baseUrl + 'action-sequence'
    })
  })
})

describe('port unavailable', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'false'
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm)
    // default mocks
    // assume ow jar is already downloaded
    writeFakeOwJar()
    execa.mockReturnValue({
      stdout: jest.fn(),
      kill: jest.fn()
    })
    Bundler.mockServe.mockReturnValue({
      address: () => {
        return { port: 99 }
      }
    })

    fetch.mockResolvedValue({
      ok: true
    })
    // should expose a new config with local credentials when reloaded in the dev cmd
    // we could also not mock aioConfig and expect it to read from .env
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.local)
  })

  test('should return the used port', async () => {
    const httpsConfig = { https: { cert: 'cert.cert', key: 'key.key' } }
    const resultUrl = await ref.scripts.runDev([8888], httpsConfig)
    expect(Bundler.mockServe).toHaveBeenCalledWith(8888, httpsConfig.https)
    expect(resultUrl).toBe('https://localhost:99')
  })
})

test('No backend is present', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  vol.unlinkSync('./manifest.yml')

  const scripts = await AppScripts()
  await scripts.runDev()
  expect(vol.existsSync('/web-src/src/config.json')).toEqual(true)
})
