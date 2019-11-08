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

const path = require('path')
// import exposed module
const AppScripts = require('../')
const mockAIOConfig = require('@adobe/aio-lib-core-config')

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
  expect(AppScripts.bind(this)).toThrowWithMessageContaining(['missing', 'manifest'])
})

test('Fail load AppScripts with missing package.json', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  fs.unlinkSync(path.join(process.cwd(), 'package.json'))
  expect(AppScripts.bind(this)).toThrowWithMessageContaining(['missing', 'package.json'])
})
