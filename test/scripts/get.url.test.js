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
const retUrls = {
  action: 'https://fake_ns.adobeioruntime.net/api/v1/web/sample-app-1.0.0/action',
  'action-zip': 'https://fake_ns.adobeioruntime.net/api/v1/web/sample-app-1.0.0/action-zip',
  cdnAction: 'https://fake_ns.adobeio-static.net/api/v1/web/sample-app-1.0.0/action',
  'cdnAction-zip': 'https://fake_ns.adobeio-static.net/api/v1/web/sample-app-1.0.0/action-zip'
}

beforeEach(() => {
  global.cleanFs(vol)
})

test('get all action URLs', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  const urls = await scripts.getUrls()
  expect(urls.runtime).toEqual(expect.objectContaining({ action: retUrls.action }))
  expect(urls.runtime).toEqual(expect.objectContaining({ 'action-zip': retUrls['action-zip'] }))
})

test('get all action URLs with cdn flag', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  const urls = await scripts.getUrls({ cdn: true })
  expect(urls.runtime).toEqual(expect.objectContaining({ action: retUrls.action }))
  expect(urls.runtime).toEqual(expect.objectContaining({ 'action-zip': retUrls['action-zip'] }))
  expect(urls.cdn).toEqual(expect.objectContaining({ action: retUrls.cdnAction }))
  expect(urls.cdn).toEqual(expect.objectContaining({ 'action-zip': retUrls['cdnAction-zip'] }))
})

test('get single action URL with cdn flag', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  const urls = await scripts.getUrls({ action: 'action', cdn: true })
  expect(urls.runtime['action-zip']).toBeUndefined()
  expect(urls.runtime).toEqual(expect.objectContaining({ action: retUrls.action }))
  expect(urls.cdn['action-zip']).toBeUndefined()
  expect(urls.cdn).toEqual(expect.objectContaining({ action: retUrls.cdnAction }))
})

test('get single action URL', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  const urls = await scripts.getUrls({ action: 'action' })
  expect(urls.runtime['action-zip']).toBeUndefined()
  expect(urls.runtime).toEqual(expect.objectContaining({ action: retUrls.action }))
})

test('Throw error for non existing action', async () => {
  global.loadFs(vol, 'sample-app')

  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)

  const scripts = await AppScripts()
  await expect(scripts.getUrls({ action: 'invalid' })).rejects.toThrow('No action with name invalid found')
})
