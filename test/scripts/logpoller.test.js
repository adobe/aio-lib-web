/*
Copyright 2020 Adobe. All rights reserved.
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

const execa = require('execa')
jest.mock('execa')

const fetch = require('node-fetch')
jest.mock('node-fetch')

const mockLogger = require('@adobe/aio-lib-core-logging')

const Bundler = require('parcel-bundler')
jest.mock('parcel-bundler')
const mockUIServerAddressInstance = { port: 1111 }
const mockUIServerInstance = {
  close: jest.fn(),
  address: jest.fn().mockReturnValue(mockUIServerAddressInstance)
}

const BuildActions = require('../../scripts/build.actions')
const DeployActions = require('../../scripts/deploy.actions')

const ActionLogs = require('../../scripts/logs')
jest.mock('../../scripts/logs')

const mockOWActivationLogs = jest.fn()

jest.mock('../../scripts/build.actions')
jest.mock('../../scripts/deploy.actions')

jest.mock('http-terminator')
const httpTerminator = require('http-terminator')
const mockTerminatorInstance = {
  terminate: jest.fn()
}

let deployActionsSpy
let logActionSpy

process.exit = jest.fn()
const mockOnProgress = jest.fn()

beforeEach(() => {
  global.cleanFs(vol)
  delete process.env.REMOTE_ACTIONS

  BuildActions.mockClear()
  ActionLogs.mockClear()

  DeployActions.mockClear()

  fetch.mockReset()
  execa.mockReset()

  mockLogger.mockReset()
  ActionLogs.mockReset()
  Bundler.mockReset()
  // mock bundler server
  Bundler.mockServe.mockResolvedValue(mockUIServerInstance)
  mockUIServerInstance.close.mockReset()
  mockUIServerInstance.address.mockClear()
  mockUIServerAddressInstance.port = 1111

  process.exit.mockReset()
  process.removeAllListeners('SIGINT')

  mockOnProgress.mockReset()

  httpTerminator.createHttpTerminator.mockReset()
  httpTerminator.createHttpTerminator.mockImplementation(() => mockTerminatorInstance)
  mockTerminatorInstance.terminate.mockReset()

  deployActionsSpy = jest.spyOn(DeployActions.prototype, 'run')
  deployActionsSpy.mockResolvedValue({})
  mockOWActivationLogs.mockReset()
})

afterAll((done) => {
  deployActionsSpy.mockRestore()
  logActionSpy.mockRestore()
  done()
})

async function loadEnvScripts (project, config, excludeFiles = []) {
  // create test app
  global.loadFs(vol, project)
  excludeFiles.forEach(f => vol.unlinkSync(f))
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts({ listeners: { onProgress: mockOnProgress } })
  return scripts
}

describe('test log polling', () => {
  const ref = {}
  beforeEach(async () => {
    process.env.REMOTE_ACTIONS = 'true'
    ref.scripts = await loadEnvScripts('sample-app', global.fakeConfig.tvm)
    ref.appFiles = ['manifest.yml', 'package.json', 'web-src', 'actions']
    execa.mockReturnValue({
      stdout: jest.fn(),
      kill: jest.fn()
    })
    fetch.mockResolvedValue({
      ok: true
    })
    mockAIOConfig.get.mockReturnValue(global.fakeConfig.local)
  })

  test('should call logs method on ActionLogs stopFetchLogs true', async () => {
    logActionSpy = jest.spyOn(ActionLogs.prototype, 'run')
    logActionSpy.mockResolvedValueOnce({ lastActivationTime: 0 })
    const Dev = require('../../scripts/dev')
    const dev = new Dev(global.fakeConfig.tvm)
    await dev.logListner({ config: global.fakeConfig.tvm, resources: { stopFetchLogs: true } })
    expect(logActionSpy).toHaveBeenCalledTimes(0)
  })

  test('should throw error on calling logs method on ActionLogs', async () => {
    logActionSpy.mockReset()
    logActionSpy.mockRejectedValue('error')
    const Dev = require('../../scripts/dev')
    const dev = new Dev(global.fakeConfig.tvm)
    const resources = { stopFetchLogs: false }
    await dev.logListner({ config: global.fakeConfig.tvm, resources: resources })
    resources.stopFetchLogs = true
    expect(logActionSpy).toHaveBeenCalled()
  })

  test('should call logs method on ActionLogs', async () => {
    logActionSpy = jest.spyOn(ActionLogs.prototype, 'run')
    logActionSpy.mockResolvedValueOnce({ lastActivationTime: 0 })
    const Dev = require('../../scripts/dev')
    const dev = new Dev(global.fakeConfig.tvm)
    const resources = { stopFetchLogs: false }
    await dev.logListner({ config: global.fakeConfig.tvm, resources: resources })
    resources.stopFetchLogs = true
    expect(logActionSpy).toHaveBeenCalled()
  })

  test('should get action logs', async () => {
    logActionSpy = jest.spyOn(ActionLogs.prototype, 'run')
    logActionSpy.mockResolvedValueOnce({ lastActivationTime: 0 })
    await ref.scripts.runDev([], { fetchLogs: true })
    expect(logActionSpy).toHaveBeenCalled()
  })

  test('should emit events on poller', () => {
    return new Promise(resolve => {
      const Poller = require('../../lib/poller')
      const poller = new Poller(1)
      poller.onPoll((args) => {
        expect(args).toStrictEqual({ test: 0 })
        resolve()
      })
      poller.poll({ test: 0 })
    })
  })
})
