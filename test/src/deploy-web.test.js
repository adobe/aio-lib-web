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

const { vol } = global.mockFs()
const deployWeb = require('../../src/deploy-web')
const fs = require('fs-extra')
jest.mock('fs-extra')
const getTvmCredentials = require('../../lib/getTvmCreds')
jest.mock('../../lib/getTvmCreds')

const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage', () => {
  return jest.fn().mockImplementation(() => {
    return {
      emptyFolder: jest.fn(),
      folderExists: jest.fn().mockResolvedValue(true),
      uploadDir: jest.fn().mockImplementation((dist, folder, app, logFunc) => {
        logFunc && logFunc('boo')
      })
    }
  })
})

describe('deploy-web', () => {
  const errString = 'Please check your .env file to ensure your credentials are correct. You can also use "aio app use" to load/refresh your credentials'
  beforeEach(() => {
    // restores all spies
    RemoteStorage.mockClear()
    jest.restoreAllMocks()
    global.cleanFs(vol)
  })
  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(deployWeb()).rejects.toThrow('cannot deploy web')
    await expect(deployWeb({ app: 'nothing-here' })).rejects.toThrow('cannot deploy web')
    await expect(deployWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot deploy web')
  })

  test('throws if src dir does not exist', async () => {
    const config = {
      s3: {
        creds: 'not-null'
      },
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    await expect(deployWeb(config)).rejects.toThrow('missing files in dist')
  })

  test('throws if src dir is not a directory', async () => {
    const config = {
      s3: {
        creds: 'not-null'
      },
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    fs.existsSync.mockReturnValue(true)
    fs.lstatSync.mockReturnValue({ isDirectory: () => false })
    await expect(deployWeb(config)).rejects.toThrow('missing files in dist')
  })

  test('throws if src dir is empty', async () => {
    const config = {
      s3: {
        creds: 'not-null'
      },
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    fs.existsSync.mockReturnValue(true)
    fs.lstatSync.mockReturnValue({ isDirectory: () => true })
    fs.readdirSync.mockReturnValue({ length: 0 })
    await expect(deployWeb(config)).rejects.toThrow('missing files in dist')
  })

  test('throws on missing creds', async () => {
    const config = {
      s3: null,
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    await expect(deployWeb(config)).rejects.toThrow('missing credentials')

    config.s3 = {}
    await expect(deployWeb(config)).rejects.toThrow(errString)

    config.ow = {}
    await expect(deployWeb(config)).rejects.toThrow(errString)

    config.ow.namespace = '_'
    await expect(deployWeb(config)).rejects.toThrow(errString)

    config.ow.auth = '_'
    await expect(deployWeb(config)).rejects.toThrow(errString)

    config.s3.tvmUrl = 'asd'
    await expect(deployWeb(config)).rejects.toThrow(errString)

    config.s3.credsCacheFile = 'asd'
    await expect(deployWeb(config)).rejects.toThrow('missing files')
  })

  test('uses creds if provided', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth: 'auth'
      },
      s3: {
        creds: { obj: 'not-null' },
        folder: 'folder'
      },
      app: {
        hasFrontend: true,
        hostname: 'host'
      },
      web: {
        distProd: 'dist'
      }
    }
    fs.existsSync.mockReturnValue(true)
    fs.lstatSync.mockReturnValue({ isDirectory: () => true })
    fs.readdirSync.mockReturnValue({ length: 1 })
    await expect(deployWeb(config)).resolves.toEqual('https://ns.host/index.html')
    expect(getTvmCredentials).not.toHaveBeenCalled()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
  })

  test('calls getTvmCredentials if tvm creds not provided', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth: 'password'
      },
      s3: {
        credsCacheFile: 'file',
        tvmUrl: 'url'
      },
      app: {
        hasFrontend: true,
        hostname: 'host'
      },
      web: {
        distProd: 'dist'
      }
    }
    fs.existsSync.mockReturnValue(true)
    fs.lstatSync.mockReturnValue({ isDirectory: () => true })
    fs.readdirSync.mockReturnValue({ length: 1 })
    const mockLogger = jest.fn()
    await expect(deployWeb(config, mockLogger)).resolves.toEqual('https://ns.host/index.html')
    expect(mockLogger).toHaveBeenCalled()
    expect(getTvmCredentials).toHaveBeenCalled()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
  })

  test('warns of overwrite if exists', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth: 'password'
      },
      s3: {
        credsCacheFile: 'file',
        tvmUrl: 'url'
      },
      app: {
        hasFrontend: true,
        hostname: 'host'
      },
      web: {
        distProd: 'dist'
      }
    }
    RemoteStorage.mockImplementation(() => {
      return {
        emptyFolder: jest.fn(),
        folderExists: jest.fn().mockResolvedValue(false),
        uploadDir: jest.fn()
      }
    })
    fs.existsSync.mockReturnValue(true)
    fs.lstatSync.mockReturnValue({ isDirectory: () => true })
    const mockLogger = jest.fn()
    fs.readdirSync.mockReturnValue({ length: 1 })
    await expect(deployWeb(config, mockLogger)).resolves.toEqual('https://ns.host/index.html')
    expect(mockLogger).not.toHaveBeenCalledWith('warning: an existing deployment will be overwritten')
    expect(getTvmCredentials).toHaveBeenCalled()
    expect(RemoteStorage).toHaveBeenCalledTimes(1)
  })

  // if !tvm creds, then we require config.ow.namespace, config.ow.auth, config.s3.tvmUrl, config.s3.credsCacheFile
})
