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

beforeAll(async () => {
  await global.mockFS()
})

afterAll(async () => {
  await global.resetFS()
})

test('Load CNAScripts for valid app in tvm mode', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  global.clearProcessEnv()
  expect(CNAScripts(appDir)).toEqual(global.expectedScripts)
})

test('Load CNAScripts for valid app in creds mode, and should store them in internal config', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvCreds(appDir)
  global.clearProcessEnv()
  const scripts = await CNAScripts(appDir)
  expect(CNAScripts(appDir)).toEqual(global.expectedScripts)
  expect(scripts._config.s3.creds).toEqual(global.expectedS3ENVCreds)
})

test('Fail load CNAScripts with missing .env file', async () => {
  const appDir = await global.createTestApp()
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'env'])
})

test('Fail load CNAScripts with missing manifest.yml', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  await fs.remove(path.join(appDir, 'manifest.yml'))
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'manifest'])
})

test('Fail load CNAScripts with missing package.json', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir)
  await fs.remove(path.join(appDir, 'package.json'))
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'package.json'])
})

test('Fail load CNAScripts with missing WHISK_NAMESPACE env', async () => {
  const missing = 'WHISK_NAMESPACE'
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir, missing)
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing WHISK_AUTH env', async () => {
  const missing = 'WHISK_AUTH'
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir, missing)
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', missing])
})
test('Fail load CNAScripts with missing WHISK_APIHOST env', async () => {
  const missing = 'WHISK_APIHOST'
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir, missing)
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing TVM_URL env in tvm mode', async () => {
  const missing = 'TVM_URL'
  const appDir = await global.createTestApp()
  await global.writeEnvTVM(appDir, missing)
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', missing])
})

test('Fail load CNAScripts with missing S3_BUCKET in creds mode', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvCreds(appDir, 'S3_BUCKET')
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'credentials'])
})

test('Fail load CNAScripts with missing AWS_ACCESS_KEY_ID in creds mode', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvCreds(appDir, 'AWS_ACCESS_KEY_ID')
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'credentials'])
})

test('Fail load CNAScripts with missing AWS_SECRET_ACCESS_KEY in creds mode', async () => {
  const appDir = await global.createTestApp()
  await global.writeEnvCreds(appDir, 'AWS_SECRET_ACCESS_KEY')
  global.clearProcessEnv()
  expect(CNAScripts.bind(this, appDir)).toThrowWithMessageContaining(['missing', 'credentials'])
})
