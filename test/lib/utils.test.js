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

// const path = require('path')
const utils = require('../../lib/utils')
let mockResult = jest.fn()
jest.mock('execa', () => jest.fn().mockImplementation(() => {
  return mockResult()
}))

describe('lib/utils', () => {
  test('exists and has methods', async () => {
    expect(utils).toBeDefined()
    expect(utils.hasDockerCLI).toBeDefined()
    expect(typeof utils.hasDockerCLI).toBe('function')
    expect(utils.isDockerRunning).toBeDefined()
    expect(typeof utils.isDockerRunning).toBe('function')
    expect(utils.zip).toBeDefined()
    expect(typeof utils.zip).toBe('function')
    expect(utils.urlJoin).toBeDefined()
    expect(typeof utils.urlJoin).toBe('function')
    expect(utils.installDeps).toBeDefined()
    expect(typeof utils.installDeps).toBe('function')
    expect(utils.deployWsk).toBeDefined()
    expect(typeof utils.deployWsk).toBe('function')
    expect(utils.undeployWsk).toBeDefined()
    expect(typeof utils.undeployWsk).toBe('function')
    expect(utils.writeConfig).toBeDefined()
    expect(typeof utils.writeConfig).toBe('function')
    expect(utils.getCustomConfig).toBeDefined()
    expect(typeof utils.getCustomConfig).toBe('function')
    expect(utils.checkOpenWhiskCredentials).toBeDefined()
    expect(typeof utils.checkOpenWhiskCredentials).toBe('function')
    expect(utils.checkFile).toBeDefined()
    expect(typeof utils.checkFile).toBe('function')
    expect(utils.checkS3Credentials).toBeDefined()
    expect(typeof utils.checkS3Credentials).toBe('function')
    expect(utils.getUIDevExpressApp).toBeDefined()
    expect(typeof utils.getUIDevExpressApp).toBe('function')
    expect(utils.downloadOWJar).toBeDefined()
    expect(typeof utils.downloadOWJar).toBe('function')
    expect(utils.runOpenWhiskJar).toBeDefined()
    expect(typeof utils.runOpenWhiskJar).toBe('function')
    expect(utils.saveAndReplaceDotEnvCredentials).toBeDefined()
    expect(typeof utils.saveAndReplaceDotEnvCredentials).toBe('function')
  })

  test('urlJoin', () => {
    let res = utils.urlJoin('a', 'b', 'c')
    expect(res).toBe('a/b/c')
    // keeps leading /
    res = utils.urlJoin('/', 'a', 'b', 'c')
    expect(res).toBe('/a/b/c')

    res = utils.urlJoin('/a/b/c')
    expect(res).toBe('/a/b/c')
    // keeps inner /
    res = utils.urlJoin('a/b/c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', 'c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', '/c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', '/', 'c')
    expect(res).toBe('a/b/c')
    // collapses duplicate //
    res = utils.urlJoin('a/b', '/', '/', '/', 'c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a', 'b', 'c/')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a', 'b', 'c', '/')
    expect(res).toBe('a/b/c')

    // TODO: more?
  })

  // test('hasWskDebugInstalled', async () => {
  //   mockResult = () => {
  //     return { stdout: 'wskdebug version 8.132.3' }
  //   }
  //   const hasWskDbg = await utils.hasWskDebugInstalled()
  //   expect(hasWskDbg).toBe(true)
  // })

  // test('hasWskDebugInstalled mock false', async () => {
  //   mockResult = () => {
  //     throw Error('fake exception')
  //   }
  //   const hasWskDbg = await utils.hasWskDebugInstalled()
  //   expect(hasWskDbg).toBe(false)
  // })

  test('hasDockerCLI', async () => {
    mockResult = () => {
      return { stdout: 'docker version 8.132.3' }
    }
    const hasDocker = await utils.hasDockerCLI()
    expect(hasDocker).toBe(true)
  })

  test('hasDockerCLI mock false', async () => {
    mockResult = () => {
      throw Error('fake exception')
    }
    const hasDocker = await utils.hasDockerCLI()
    expect(hasDocker).toBe(false)
  })

  test('isDockerRunning', async () => {
    mockResult = () => {
      return { stdout: '""' }
    }
    const isRunning = await utils.isDockerRunning()
    expect(isRunning).toBe(true)
  })

  test('isDockerRunning mock false', async () => {
    mockResult = () => {
      throw Error('fake exception')
    }
    const isRunning = await utils.isDockerRunning()
    expect(isRunning).toBe(false)
  })
})
