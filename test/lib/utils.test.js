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

const utils = require('../../lib/utils')
let mockResult = jest.fn()
const execa = require('execa')
jest.mock('execa', () => jest.fn().mockImplementation(() => {
  return mockResult()
}))

const archiver = require('archiver')
jest.mock('archiver')

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
    expect(utils.checkOpenWhiskCredentials).toBeDefined()
    expect(typeof utils.checkOpenWhiskCredentials).toBe('function')
    expect(utils.checkFile).toBeDefined()
    expect(typeof utils.checkFile).toBe('function')
    expect(utils.downloadOWJar).toBeDefined()
    expect(typeof utils.downloadOWJar).toBe('function')
    expect(utils.runOpenWhiskJar).toBeDefined()
    expect(typeof utils.runOpenWhiskJar).toBe('function')
    expect(utils.saveAndReplaceDotEnvCredentials).toBeDefined()
    expect(typeof utils.saveAndReplaceDotEnvCredentials).toBe('function')
    expect(utils.getActionUrls).toBeDefined()
    expect(typeof utils.getActionUrls).toBe('function')
    expect(utils.getActionEntryFile).toBeDefined()
    expect(typeof utils.getActionEntryFile).toBe('function')
    expect(utils.getMatchingFileList).toBeDefined()
    expect(typeof utils.getMatchingFileList).toBe('function')
    expect(utils.getIncludesForAction).toBeDefined()
    expect(typeof utils.getIncludesForAction).toBe('function')
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

  test('removeProtocol', () => {
    let res = utils.removeProtocolFromURL('https://some-url')
    expect(res).toBe('some-url')

    res = utils.removeProtocolFromURL('https:/some-url')
    expect(res).toBe('https:/some-url')

    res = utils.removeProtocolFromURL('https:some-url')
    expect(res).toBe('https:some-url')

    res = utils.removeProtocolFromURL('https//some-url')
    expect(res).toBe('https//some-url')

    res = utils.removeProtocolFromURL('http://user:pass@sub.example.com:8080/p/a/t/h?query=string#hash')
    expect(res).toBe('user:pass@sub.example.com:8080/p/a/t/h?query=string#hash')
  })

  // eslint-disable-next-line jest/no-commented-out-tests
  // test('hasWskDebugInstalled', async () => {
  //   mockResult = () => {
  //     return { stdout: 'wskdebug version 8.132.3' }
  //   }
  //   const hasWskDbg = await utils.hasWskDebugInstalled()
  //   expect(hasWskDbg).toBe(true)
  // })

  // eslint-disable-next-line jest/no-commented-out-tests
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
      throw new Error('fake exception')
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
      throw new Error('fake exception')
    }
    const isRunning = await utils.isDockerRunning()
    expect(isRunning).toBe(false)
  })

  test('installDeps', async () => {
    mockResult = () => {
      return 'ok'
    }
    // installDeps
    await utils.installDeps('some-dir')
    expect(execa).toHaveBeenCalledWith('npm', expect.arrayContaining(['install']), expect.objectContaining({ cwd: 'some-dir' }))
  })
})

describe('getIncludesForAction', () => {
  beforeAll(() => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])
  })
  // beforeEach(() => {})
  // afterEach(() => {})

  test('returns [] if no action.include', async () => {
    const res = await utils.getIncludesForAction({})
    expect(res.length).toBe(0)
  })

  test('rejects if include[0] has no elements', async () => {
    await expect(utils.getIncludesForAction({ include: [[]] })).rejects.toThrow('Invalid manifest')
  })

  test('rejects if include[0] has more than 2 elements', async () => {
    await expect(utils.getIncludesForAction({ include: [[1, 2, 3]] })).rejects.toThrow('Invalid manifest')
  })

  test('matches, with dest specified', async () => {
    const res = await utils.getIncludesForAction({ include: [['/indir/*.js', '/out']] })
    expect(res).toStrictEqual(expect.arrayContaining([{ dest: '/out', sources: ['/indir/fake1.js'] }]))
  })

  test('matches without dest specified', async () => {
    const res = await utils.getIncludesForAction({ include: [['/indir/*.js']] })
    expect(res).toStrictEqual(expect.arrayContaining([{ dest: undefined, sources: ['/indir/fake1.js'] }]))
  })
})

describe('getMatchingFileList', () => {
  beforeAll(() => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])
  })

  // beforeEach(() => {})
  // afterEach(() => {})

  test('match single *.ext', async () => {
    const fileList = await utils.getMatchingFileList('/indir/*.js')
    expect(fileList.length).toBe(1)
    expect(fileList).toStrictEqual(expect.arrayContaining(['/indir/fake1.js']))
  })

  test('/**', async () => {
    const fileList = await utils.getMatchingFileList('/**')
    expect(fileList.length).toBe(1)
    expect(fileList).toStrictEqual(expect.arrayContaining(['/indir/fake1.js']))
  })

  test('no matches returns empty array', async () => {
    const fileList = await utils.getMatchingFileList('/does-not-exist')
    expect(fileList.length).toBe(0)
  })

  test('should reject if glob returns error', async () => {
    await expect(utils.getMatchingFileList()).rejects.toThrow('glob pattern string required')
  })
})

describe('lib/utils.zip', () => {
  beforeEach(async () => {
    global.cleanFs(vol)
    archiver.mockReset()
  })

  test('should zip a directory', async () => {
    global.addFakeFiles(vol, '/indir', ['fake1.js', 'fake2.js'])
    await utils.zip('/indir', '/out.zip')

    expect(archiver.mockDirectory).toHaveBeenCalledWith('/indir', false)
    expect(archiver.mockFile).toHaveBeenCalledTimes(0)
    expect(vol.existsSync('/out.zip')).toEqual(true)
  })

  test('should zip a file with pathInZip=false', async () => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])

    await utils.zip('/indir/fake1.js', '/out.zip')

    expect(archiver.mockFile).toHaveBeenCalledWith('/indir/fake1.js', { name: 'fake1.js' })
    expect(archiver.mockDirectory).toHaveBeenCalledTimes(0)
    expect(vol.existsSync('/out.zip')).toEqual(true)
  })

  test('should zip a file with pathInZip=some/path.js', async () => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])

    await utils.zip('/indir/fake1.js', '/out.zip', 'some/path.js')

    expect(archiver.mockFile).toHaveBeenCalledWith('/indir/fake1.js', { name: 'some/path.js' })
    expect(archiver.mockDirectory).toHaveBeenCalledTimes(0)
    expect(vol.existsSync('/out.zip')).toEqual(true)
  })

  test('should fail if symlink', async () => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])
    vol.symlinkSync('/indir/fake1.js', '/indir/symlink.js')
    await expect(utils.zip('/indir/symlink.js', '/out.zip')).rejects.toThrow('symlink.js is not a valid dir or file')
    expect(archiver.mockFile).toHaveBeenCalledTimes(0)
    expect(archiver.mockDirectory).toHaveBeenCalledTimes(0)
    expect(vol.existsSync('/out.zip')).toEqual(false)
  })

  test('should fail if file does not exists', async () => {
    await expect(utils.zip('/notexist.js', '/out.zip')).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('ENOENT') }))
    expect(archiver.mockFile).toHaveBeenCalledTimes(0)
    expect(archiver.mockDirectory).toHaveBeenCalledTimes(0)
    expect(vol.existsSync('/out.zip')).toEqual(false)
  })

  test('should fail if there is a stream error', async () => {
    global.addFakeFiles(vol, '/indir', ['fake1.js'])
    archiver.setFakeError(new Error('fake stream error'))
    await expect(utils.zip('/indir/fake1.js', '/out.zip')).rejects.toThrow('fake stream error')
  })
})

// todo test utils independently + mock utils in scripts once it is exposed as a library
// for now we test most of utils through scripts
