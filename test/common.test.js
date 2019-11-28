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

const { vol, fs } = global.mockFs()
const cloneDeep = require('lodash.clonedeep')
const path = require('path')
// import exposed module
const AppScripts = require('../')
const mockAIOConfig = require('@adobe/aio-lib-core-config')

const defaultAppHostName = 'adobeio-static.net'

beforeEach(async () => {
  // create test app and switch cwd
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReset()
})

afterEach(() => {
  global.cleanFs(vol)
})

test('Load AppScripts for valid app in tvm mode', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  expect(AppScripts()).toEqual(global.expectedScripts)
})

test('Load AppScripts for valid app in creds mode, and should store them in internal config', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
  const scripts = AppScripts()
  expect(scripts).toEqual(global.expectedScripts)
  expect(scripts._config.s3.creds).toEqual(global.expectedS3ENVCreds)
})

test('Fail load AppScripts with missing manifest.yml', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  fs.unlinkSync(path.join(process.cwd(), 'manifest.yml'))
  expect(AppScripts.bind(this)).toThrowWithMessageContaining(['no such file', 'manifest.yml'])
})

test('Fail load AppScripts with symlink manifest.yml', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  fs.unlinkSync('/manifest.yml')
  fs.symlinkSync('fake', '/manifest.yml')
  expect(AppScripts.bind(this)).toThrowWithMessageContaining([`${r('/manifest.yml')} is not a valid file (e.g. cannot be a dir or a symlink)`])
})

test('Fail load AppScripts with missing package.json', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  fs.unlinkSync(path.join(process.cwd(), 'package.json'))
  expect(AppScripts.bind(this)).toThrowWithMessageContaining(['no such file', 'package.json'])
})

test('Fail load AppScripts with symlink package.json', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  fs.unlinkSync('/package.json')
  fs.symlinkSync('fake', '/package.json')
  expect(AppScripts.bind(this)).toThrowWithMessageContaining([`${r('/package.json')} is not a valid file (e.g. cannot be a dir or a symlink)`])
})

test('should use default hostname if app uses tvm but there is no cna.hostname configuration', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  const scripts = AppScripts()
  expect(scripts._config.app.hostname).toBe(defaultAppHostName)
})

test('should use no custom hostname if app uses provided s3 credentials and no hostname was configured', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
  const scripts = AppScripts()
  expect(scripts._config.app.hostname).toBe(undefined)
})

test('should use configured cna.hostname if app uses provided s3 credentials', async () => {
  const config = cloneDeep(global.fakeConfig.creds)
  config.cna.hostname = 'fake-domain.net'
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts()
  expect(scripts._config.app.hostname).toBe('fake-domain.net')
})

test('should use configured cna.hostname if app uses tvm', async () => {
  const config = cloneDeep(global.fakeConfig.tvm)
  config.cna.hostname = 'fake-domain.net'
  mockAIOConfig.get.mockReturnValue(config)
  const scripts = AppScripts()
  expect(scripts._config.app.hostname).toBe('fake-domain.net')
})

test('Config defaults', async () => {
  mockAIOConfig.get.mockReturnValue({})
  const scripts = AppScripts()
  expect(scripts._config.ow.apiversion).toBe('v1')
})

test('Empty Config get', async () => {
  mockAIOConfig.get.mockReturnValue(null)
  const scripts = AppScripts()
  expect(scripts._config.ow.apiversion).toBe('v1')
})

test('Load pp without any name and version in package.json ', async () => {
  mockAIOConfig.get.mockReturnValue({})
  fs.writeFileSync('package.json', '{}')
  const scripts = AppScripts()
  expect(scripts._config.app.version).toBe('0.0.1')
})
