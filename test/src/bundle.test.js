/*
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { vol } = global.mockFs()
const bundle = require('../../src/bundle')
const fs = require('fs-extra')
jest.mock('fs-extra')

describe('bundle', () => {
  beforeEach(() => {
    // restores all spies
    fs.readdir.mockReset()
    jest.restoreAllMocks()
    global.cleanFs(vol)
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    // much of this is actually now the callers responsibility
    await expect(bundle()).rejects.toThrow('cannot build web')
    await expect(bundle('dne')).rejects.toThrow('cannot build web')
    fs.existsSync.mockReturnValue(true)
    await expect(bundle('exists')).rejects.toThrow('cannot build web, missing')
  })

  test('build (with and without log function)', async () => {
    const config = {
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist',
        src: 'fakeDir'
      }
    }
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': '' })
    fs.readdir.mockReturnValue(['output.html'])
    const logFunc = jest.fn()
    await expect(bundle('fakeDir/index.html', config.web.distProd, { }, logFunc)).resolves.toBeTruthy()
  })

  test('check build options', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': '' })
    await expect(bundle('fakeDir/index.html', 'distProd')).resolves.toEqual(
      expect.objectContaining({ bundler: expect.any(Object) }))
    expect(global._bundler__arguments).toEqual([
      expect.objectContaining({
        defaultConfig: expect.stringContaining('@parcel/config-default/index.json'),
        defaultTargetOptions: expect.objectContaining({
          distDir: 'distProd',
          shouldOptimize: false
        }),
        entries: 'fakeDir/index.html',
        logLevel: 'error',
        shouldContentHash: true,
        shouldDisableCache: false
      })])
  })

  test('uses build options', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': '' })
    await expect(bundle('fakeDir/index.html', 'distProd', { contentHash: false, logLevel: 5 }))
      .resolves.toEqual(expect.objectContaining({ bundler: expect.any(Object) }))
    expect(global._bundler__arguments).toEqual([
      expect.objectContaining({
        defaultConfig: expect.stringContaining('@parcel/config-default/index.json'),
        defaultTargetOptions: expect.objectContaining({
          distDir: 'distProd',
          shouldOptimize: false
        }),
        entries: 'fakeDir/index.html',
        shouldContentHash: true,
        shouldDisableCache: false
      })])
  })

  test('returns {bundle, cleanup}', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': '' })

    const { bundler, cleanup } = await bundle('fakeDir/index.html', 'distProd', { contentHash: false, logLevel: 5 })
    expect(bundler).toBeDefined()
    expect(cleanup).toBeDefined()
    expect(typeof cleanup).toBe('function')
    bundler.stop = jest.fn()
    cleanup()
  })
})
