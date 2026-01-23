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

const mockRemoteStorageInstance = {
  uploadDir: jest.fn()
}
const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage', () => {
  return jest.fn().mockImplementation(() => {
    return mockRemoteStorageInstance
  })
})

describe('deploy-web', () => {
  beforeEach(() => {
    RemoteStorage.mockClear()
    mockRemoteStorageInstance.uploadDir.mockReset()

    global.cleanFs(vol)
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(deployWeb()).rejects.toThrow('cannot deploy web')
    await expect(deployWeb({ app: 'nothing-here' })).rejects.toThrow('cannot deploy web')
    await expect(deployWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot deploy web')
  })

  test('throws if no auth token', async () => {
    const config = {
      app: {
        hasFrontend: true
      },
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue(null)
        }
      },
      web: {
        distProd: 'dist'
      }
    }
    await expect(deployWeb(config)).rejects.toThrow('cannot deploy web, Authorization is required')
  })

  test('throws if src dir does not exist', async () => {
    const config = {
      s3: {
        folder: 'somefolder'
      },
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue('Bearer token')
        }
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
        folder: 'somefolder'
      },
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue('Bearer token')
        }
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
        folder: 'somefolder'
      },
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue('Bearer token')
        }
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

  test('uploads files', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue('Bearer token')
        }
      },
      s3: {
        folder: 'somefolder'
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
    expect(RemoteStorage).toHaveBeenCalledWith('Bearer token')
    expect(mockRemoteStorageInstance.uploadDir).toHaveBeenCalledWith('dist', 'somefolder', config, null)
  })

  test('uploads files with log func', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue('Bearer token')
        }
      },
      s3: {
        folder: 'somefolder'
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
    // for func coverage
    mockRemoteStorageInstance.uploadDir.mockImplementation((a, b, c, func) => func('dist/somefile'))
    await expect(deployWeb(config, mockLogger)).resolves.toEqual('https://ns.host/index.html')
    expect(RemoteStorage).toHaveBeenCalledWith('Bearer token')
    expect(mockRemoteStorageInstance.uploadDir).toHaveBeenCalledWith('dist', 'somefolder', config, expect.any(Function))
    expect(mockLogger).toHaveBeenCalledWith('deploying somefile')
  })
})
