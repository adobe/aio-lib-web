/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const path = require('path')
const { vol } = global.mockFs()
const buildWeb = require('../../src/build-web')
const fs = require('fs-extra')
jest.mock('fs-extra')

describe('build-web', () => {
  beforeEach(() => {
    // restores all spies
    fs.readdir.mockReset()
    jest.restoreAllMocks()
    global.cleanFs(vol)
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(buildWeb()).rejects.toThrow('cannot build web')
    await expect(buildWeb({ app: 'nothing-here' })).rejects.toThrow('cannot build web')
    await expect(buildWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot build web')
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
    await expect(buildWeb(config, logFunc)).resolves.toEqual(['output.html'])
    expect(logFunc).toHaveBeenCalled()

    // no log
    await expect(buildWeb(config)).resolves.toEqual(['output.html'])
  })

  test('check build options', async () => {
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
    await expect(buildWeb(config)).resolves.toEqual(['output.html'])
    expect(global._bundler__arguments).toEqual([
      expect.objectContaining({
        defaultConfig: expect.stringContaining(path.join('parcel', 'config-default', 'index.json')),
        defaultTargetOptions: expect.objectContaining({
          distDir: 'dist',
          publicUrl: './'
        }),
        entries: path.join('fakeDir', 'index.html'),
        logLevel: 'none',
        shouldContentHash: true,
        shouldDisableCache: true
      })
    ])
  })
})
