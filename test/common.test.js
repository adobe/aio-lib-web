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

const fs = require('fs-extra')
const path = require('path')
// import exposed module
const CNAScripts = require('../')
const mockAIOConfig = require('@adobe/aio-cli-config')

beforeAll(async () => {
  await global.mockFS()
})

afterAll(async () => {
  await global.resetFS()
})

beforeEach(async () => {
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReset()
})

function withoutKey (object, topKey, key) {
  // deep copy
  const copy = JSON.parse(JSON.stringify(object))
  delete copy[topKey][key]
  return copy
}

test('Load CNAScripts for valid app in tvm mode', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  expect(CNAScripts()).toEqual(global.expectedScripts)
})

test('Load CNAScripts for valid app in creds mode, and should store them in internal config', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.creds)
  const scripts = CNAScripts()
  expect(scripts).toEqual(global.expectedScripts)
  expect(scripts._config.s3.creds).toEqual(global.expectedS3ENVCreds)
})

test('Fail load CNAScripts with missing config', async () => {
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing'])
})

test('Fail load CNAScripts with missing manifest.yml', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  await fs.remove(path.join(process.cwd(), 'manifest.yml'))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', 'manifest'])
})

test('Fail load CNAScripts with missing package.json', async () => {
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  await fs.remove(path.join(process.cwd(), 'package.json'))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', 'package.json'])
})

test('Fail load CNAScripts with missing namespace config', async () => {
  const missing = 'namespace'
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.tvm, 'runtime', missing))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing auth config', async () => {
  const missing = 'auth'
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.tvm, 'runtime', missing))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', missing])
})
test('Fail load CNAScripts with missing apihost env', async () => {
  const missing = 'apihost'
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.tvm, 'runtime', missing))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing tvmurl config in tvm mode', async () => {
  const missing = 'tvmurl'
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.tvm, 'cna', missing))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing s3bucket config in creds mode', async () => {
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.creds, 'cna', 's3bucket'))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing'])
})

test('Fail load CNAScripts with missing awsaccesskeyid config in creds mode', async () => {
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.creds, 'cna', 'awsaccesskeyid'))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing'])
})
test('Fail load CNAScripts with missing awssecretaccesskey config in creds mode', async () => {
  mockAIOConfig.get.mockReturnValue(withoutKey(global.fakeConfig.creds, 'cna', 'awssecretaccesskey'))
  expect(CNAScripts.bind(this)).toThrowWithMessageContaining(['missing'])
})
