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

const Bundler = require('parcel-bundler')
jest.mock('parcel-bundler')

const mockOnProgress = jest.fn()

beforeEach(() => {
  // those are defined in __mocks__
  Bundler.mockConstructor.mockReset()
  Bundler.mockBundle.mockReset()
  mockOnProgress.mockReset()
  global.cleanFs(vol)
})

test('Should fail build if app has no frontend', async () => {
  global.loadFs(vol, 'sample-app')
  vol.unlinkSync('/web-src/index.html')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()

  await expect(scripts.buildUI()).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('app has no frontend') }))
})

test('should send a warning if namespace is not configured (for action urls)', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.configWithMissing(global.fakeConfig.tvm, 'runtime.namespace'))
  const warningMock = jest.fn()
  const scripts = await AppScripts({ listeners: { onWarning: warningMock } })
  await scripts.buildUI()

  expect(warningMock).toHaveBeenCalledWith(expect.stringContaining('injected urls to backend actions are invalid'))
})

test('should build static files from web-src/index.html', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  Bundler.mockBundle.mockImplementation(async () => {
    global.addFakeFiles(vol, '/dist/web-src-prod/', ['fake.js', 'fake.js.map'])
  })

  const scripts = await AppScripts({ listeners: { onProgress: mockOnProgress } })

  await scripts.buildUI()

  // make sure action and sequence urls are available to the UI
  const uiConfig = JSON.parse((vol.readFileSync(scripts._config.web.injectedConfig)).toString())
  expect(uiConfig).toEqual(expect.objectContaining({
    action: expect.any(String),
    'action-zip': expect.any(String),
    'action-sequence': expect.any(String)
  }))

  expect(Bundler.mockConstructor).toHaveBeenCalledWith(r('/web-src/index.html'), expect.objectContaining({
    publicUrl: './',
    outDir: r('/dist/web-src-prod')
  }))
  expect(Bundler.mockBundle).toHaveBeenCalledTimes(1)
  expect(mockOnProgress).toHaveBeenCalledWith(n('dist/web-src-prod/fake.js'))
  expect(mockOnProgress).toHaveBeenCalledWith(n('dist/web-src-prod/fake.js.map'))
})

test('should generate and inject web action Urls into web-src/src/config.json, including action sequence url', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()

  await scripts.buildUI()
  const remoteOWCredentials = global.fakeConfig.tvm.runtime
  expect(vol.existsSync('/web-src/src/config.json')).toBe(true)
  const baseUrl = 'https://' + remoteOWCredentials.namespace + '.' + global.defaultAppHostName + '/api/v1/web/sample-app-1.0.0/'
  expect(JSON.parse(vol.readFileSync('/web-src/src/config.json').toString())).toEqual({
    action: baseUrl + 'action',
    'action-zip': baseUrl + 'action-zip',
    'action-sequence': baseUrl + 'action-sequence'
  })
})

test('should generate and inject web and non web action urls into web-src/src/config.json', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  // delete sequence action to make sure url generation works without sequences as well
  delete scripts._config.manifest.package.sequences
  // also make sure to test urls for non web actions
  delete scripts._config.manifest.package.actions.action.web

  await scripts.buildUI()
  const remoteOWCredentials = global.fakeConfig.tvm.runtime
  expect(vol.existsSync('/web-src/src/config.json')).toBe(true)
  const baseUrl = 'https://' + remoteOWCredentials.namespace + '.' + global.defaultAppHostName + '/api/v1/web/sample-app-1.0.0/'
  const baseUrlNonWeb = 'https://' + remoteOWCredentials.namespace + '.' + global.defaultOwApiHost.split('https://')[1] + '/api/v1/sample-app-1.0.0/'
  expect(JSON.parse(vol.readFileSync('/web-src/src/config.json').toString())).toEqual({
    action: baseUrlNonWeb + 'action', // fake non web action
    'action-zip': baseUrl + 'action-zip'
  })
})
