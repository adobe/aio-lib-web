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
const utils = require('../../lib/utils')

// mocks
const fsExtra = require('fs-extra')
fsExtra.moveSync = jest.fn() // even tho we mock the fs let's mock the move of map file

jest.mock('webpack')
const webpack = require('webpack')
const webpackMock = {
  run: jest.fn()
}
webpack.mockReturnValue(webpackMock)

utils.installDeps = jest.fn()
// todo mock zip dependency instead of full utility for 100% coverage
utils.zip = jest.fn()

const mockAIOConfig = require('@adobe/aio-lib-core-config')

beforeEach(() => {
  global.cleanFs(vol)

  utils.zip.mockReset()
  utils.installDeps.mockReset()

  webpack.mockClear()
  webpackMock.run.mockReset()
  fsExtra.moveSync.mockReset()

  webpackMock.run.mockImplementation(cb => cb(null, {}))
})
test('Build actions: 1 zip and 1 js', async () => {
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  const scripts = await AppScripts()

  await scripts.buildActions()

  expect(utils.zip).toHaveBeenCalledWith('/actions/action-zip', '/dist/actions/action-zip.zip')
  expect(utils.zip).toHaveBeenCalledWith('/dist/actions/debug-action/action.js', '/dist/actions/action.zip', 'index.js')
  expect(utils.installDeps).toHaveBeenCalledWith('/actions/action-zip')

  expect(fsExtra.moveSync).toHaveBeenCalledWith('/dist/actions/debug-action/action.js.map', '/actions/action.js.map', { overwrite: true })

  expect(webpack).toHaveBeenCalledWith(expect.objectContaining({
    entry: ['/actions/action.js'],
    output: expect.objectContaining({
      path: '/dist/actions/debug-action',
      filename: 'action.js'
    })
  }))
  expect(webpackMock.run).toHaveBeenCalledTimes(1)
})
