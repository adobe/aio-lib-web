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

const deepCopy = require('lodash.clonedeep')

const Openwhisk = require('openwhisk')
jest.mock('openwhisk')

const mockOWActivationList = jest.fn()
const mockOWActivationLogs = jest.fn()

Openwhisk.mockReturnValue({
  activations: {
    list: mockOWActivationList,
    logs: mockOWActivationLogs
  }
})

beforeEach(() => {
  mockOWActivationList.mockReset()
  mockOWActivationLogs.mockReset()

  global.cleanFs(vol)
})

test('Should fail if missing runtime namespace', async () => {
  global.loadFs(vol, 'sample-app')

  const config = deepCopy(global.fakeConfig.tvm)
  delete config.runtime.namespace
  mockAIOConfig.get.mockReturnValue(config)

  const scripts = await AppScripts()

  await expect(scripts.logs()).rejects.toThrow('missing Adobe I/O Runtime namespace')
})

test('Should fail if missing runtime auth', async () => {
  global.loadFs(vol, 'sample-app')

  const config = deepCopy(global.fakeConfig.tvm)
  delete config.runtime.auth
  mockAIOConfig.get.mockReturnValue(config)

  const scripts = await AppScripts()

  await expect(scripts.logs()).rejects.toThrow('missing Adobe I/O Runtime auth')
})

test('no options, no activations availaible', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  mockOWActivationList.mockResolvedValue([
  ])

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  const scripts = await AppScripts()

  const res = await scripts.logs()

  expect(res.hasLogs).toBe(false)
  expect(console.log).toBeCalledTimes(0)
  spy.mockRestore()
})

test('no options, no logs availaible', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId' }
  ])

  mockOWActivationLogs.mockResolvedValue({ logs: [] })

  const scripts = await AppScripts()

  const res = await scripts.logs()

  expect(res.hasLogs).toBe(false)
  expect(console.log).toBeCalledTimes(0)
  spy.mockRestore()
})

test('no options, logs availaible', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId', start: 0 }
  ])

  mockOWActivationLogs.mockResolvedValue({ logs: ['fake log1', 'fake log2'] })

  const scripts = await AppScripts()

  const res = await scripts.logs()

  expect(res.hasLogs).toBe(true)
  expect(res.lastActivationTime).toBe(0)
  expect(mockOWActivationList).toHaveBeenCalledWith({ limit: 1, skip: 0 })
  expect(mockOWActivationLogs).toBeCalledTimes(1)
  expect(mockOWActivationLogs).toBeCalledWith(expect.objectContaining({ activationId: 'fakeId' }))

  expect(console.log).toBeCalledWith('fake:fakeId')
  expect(console.log).toHaveBeenCalledWith('fake log1')
  expect(console.log).toHaveBeenCalledWith('fake log2')

  spy.mockRestore()
})

test('no options, logs availaible, startTime smaller than activation start', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId', start: 100 }
  ])

  mockOWActivationLogs.mockResolvedValue({ logs: ['fake log1', 'fake log2'] })

  const scripts = await AppScripts()

  const res = await scripts.logs([], { startTime: 50 })

  expect(res.hasLogs).toBe(true)
  expect(res.lastActivationTime).toBe(100)
  expect(mockOWActivationList).toHaveBeenCalledWith({ limit: 1, skip: 0 })
  expect(mockOWActivationLogs).toBeCalledTimes(1)
  expect(mockOWActivationLogs).toBeCalledWith(expect.objectContaining({ activationId: 'fakeId' }))

  expect(console.log).toBeCalledWith('fake:fakeId')
  expect(console.log).toHaveBeenCalledWith('fake log1')
  expect(console.log).toHaveBeenCalledWith('fake log2')

  spy.mockRestore()
})

test('no options, logs availaible, startTime greater than activation start', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId', start: 100 }
  ])

  mockOWActivationLogs.mockResolvedValue({ logs: ['fake log1', 'fake log2'] })

  const scripts = await AppScripts()

  const res = await scripts.logs([], { startTime: 110 })

  expect(res.hasLogs).toBe(false)
  expect(res.lastActivationTime).toBe(100)
  expect(mockOWActivationList).toHaveBeenCalledWith({ limit: 1, skip: 0 })
  expect(mockOWActivationLogs).toBeCalledTimes(1)
  spy.mockRestore()
})

test('limit=2, logs availaible', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const spy = jest.spyOn(console, 'log')
  spy.mockImplementation(() => {})

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId', start: 0 },
    { name: 'fake2', activationId: 'fakeId2', start: 0 }
  ])

  mockOWActivationLogs.mockResolvedValueOnce({ logs: ['fake log1', 'fake log2'] })
  mockOWActivationLogs.mockResolvedValueOnce({ logs: ['fake2 log1', 'fake2 log2'] })

  const scripts = await AppScripts()

  const res = await scripts.logs([], { limit: 2 })

  expect(res.hasLogs).toBe(true)
  expect(res.lastActivationTime).toBe(0)

  expect(mockOWActivationList).toHaveBeenCalledWith({ limit: 2, skip: 0 })

  expect(mockOWActivationLogs).toBeCalledTimes(2)
  expect(mockOWActivationLogs).toBeCalledWith(expect.objectContaining({ activationId: 'fakeId' }))
  expect(mockOWActivationLogs).toBeCalledWith(expect.objectContaining({ activationId: 'fakeId2' }))

  expect(console.log).toBeCalledWith('fake:fakeId')
  expect(console.log).toHaveBeenCalledWith('fake log1')
  expect(console.log).toHaveBeenCalledWith('fake log2')
  expect(console.log).toBeCalledWith('fake2:fakeId2')
  expect(console.log).toHaveBeenCalledWith('fake2 log1')
  expect(console.log).toHaveBeenCalledWith('fake2 log2')
  spy.mockRestore()
})

test('logger=jest.fn(), logs availaible', async () => {
  global.loadFs(vol, 'sample-app')
  const config = deepCopy(global.fakeConfig.tvm)
  mockAIOConfig.get.mockReturnValue(config)

  const mockLogger = jest.fn()

  mockOWActivationList.mockResolvedValue([
    { name: 'fake', activationId: 'fakeId', start: 0 }
  ])

  mockOWActivationLogs.mockResolvedValue({ logs: ['fake log1', 'fake log2'] })

  const scripts = await AppScripts()

  const res = await scripts.logs([], { logger: mockLogger })

  expect(res.hasLogs).toBe(true)
  expect(res.lastActivationTime).toBe(0)
  expect(mockOWActivationList).toHaveBeenCalledWith({ limit: 1, skip: 0 })
  expect(mockOWActivationLogs).toBeCalledTimes(1)
  expect(mockOWActivationLogs).toBeCalledWith(expect.objectContaining({ activationId: 'fakeId' }))

  expect(mockLogger).toBeCalledWith('fake:fakeId')
  expect(mockLogger).toHaveBeenCalledWith('fake log1')
  expect(mockLogger).toHaveBeenCalledWith('fake log2')
})
