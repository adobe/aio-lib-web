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

jest.mock('parcel-bundler')
afterEach(() => global.cleanFs(vol))

test('Should fail build if app has no frontend', async () => {
  global.loadFs(vol, 'sample-app')
  vol.unlinkSync('/web-src/index.html')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()

  await expect(scripts.buildUI()).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('app has no frontend') }))
})

test('Build static files index.html', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  const buildDir = scripts._config.web.distProd

  await scripts.buildUI()

  // make sure action and sequence urls are available to the UI
  const uiConfig = JSON.parse((vol.readFileSync(scripts._config.web.injectedConfig)).toString())
  expect(uiConfig).toEqual(expect.objectContaining({
    action: expect.any(String),
    'action-zip': expect.any(String),
    'action-sequence': expect.any(String)
  }))
  const buildFiles = vol.readdirSync(buildDir)
  expect(buildFiles.sort()).toEqual(['index.html'])
})

// test('Set Action URL with Namespace subdomain', async () => {
//   mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
//   const scripts = AppScripts()
//   expect(scripts._config.actions.urls.action).toBe(actionURL)
// })