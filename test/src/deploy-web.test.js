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
  emptyFolder: jest.fn(),
  folderExists: jest.fn(),
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
    mockRemoteStorageInstance.emptyFolder.mockReset()
    mockRemoteStorageInstance.folderExists.mockReset()
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

  test('throws if hostname or namespace is missing', async () => {
    const baseConfig = {
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

    await expect(deployWeb({
      ...baseConfig,
      app: { hasFrontend: true }
    })).rejects.toThrow('config.app.hostname and config.ow.namespace are required')

    await expect(deployWeb({
      ...baseConfig,
      ow: { auth_handler: baseConfig.ow.auth_handler }
    })).rejects.toThrow('config.app.hostname and config.ow.namespace are required')
  })

  test('throws if hostname or namespace has invalid characters', async () => {
    const baseConfig = {
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

    await expect(deployWeb({
      ...baseConfig,
      app: { ...baseConfig.app, hostname: 'bad host!' }
    })).rejects.toThrow('config.app.hostname and config.ow.namespace are invalid')

    await expect(deployWeb({
      ...baseConfig,
      ow: { ...baseConfig.ow, namespace: 'bad/ns' }
    })).rejects.toThrow('config.app.hostname and config.ow.namespace are invalid')
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

  test('clears existing deployment before uploading to avoid stale files', async () => {
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
    mockRemoteStorageInstance.folderExists.mockResolvedValue(true)

    await deployWeb(config)

    expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith('/', config)
    expect(mockRemoteStorageInstance.emptyFolder).toHaveBeenCalledWith('/', config)
    expect(mockRemoteStorageInstance.uploadDir).toHaveBeenCalledWith('dist', 'somefolder', config, null)
    expect(mockRemoteStorageInstance.emptyFolder.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoteStorageInstance.uploadDir.mock.invocationCallOrder[0]
    )
  })
})
