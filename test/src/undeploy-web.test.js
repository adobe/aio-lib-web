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

const undeployWeb = require('../../src/undeploy-web')

const mockRemoteStorageInstance = {
  emptyFolder: jest.fn(),
  folderExists: jest.fn()
}
const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage', () => {
  return jest.fn().mockImplementation(() => {
    return mockRemoteStorageInstance
  })
})

describe('undeploy-web', () => {
  beforeEach(() => {
    RemoteStorage.mockClear()
    mockRemoteStorageInstance.emptyFolder.mockReset()
    mockRemoteStorageInstance.folderExists.mockReset()
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(undeployWeb()).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: 'nothing-here' })).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot undeploy web')
  })

  test('throws if no auth token', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth_handler: {
          getAuthHeader: jest.fn().mockResolvedValue(null)
        }
      },
      app: {
        hasFrontend: true
      }
    }
    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy web, Authorization is required')
  })

  test('calls folderExists and empties folder', async () => {
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
    mockRemoteStorageInstance.folderExists.mockResolvedValue(true)
    mockRemoteStorageInstance.emptyFolder.mockResolvedValue(true)
    await undeployWeb(config)
    expect(RemoteStorage).toHaveBeenCalledWith()
    expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith('Bearer token', '/', config)
    expect(mockRemoteStorageInstance.emptyFolder).toHaveBeenCalledWith('Bearer token', '/', config)
  })

  test('throws if remoteStorage folder does not exist', async () => {
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
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    mockRemoteStorageInstance.folderExists.mockResolvedValue(false)
    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy static files')
    expect(RemoteStorage).toHaveBeenCalledWith()
    expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith('Bearer token', '/', config)
    expect(mockRemoteStorageInstance.emptyFolder).not.toHaveBeenCalled()
  })

  test('throws if config has no ow auth_handler', async () => {
    const config = { app: { hasFrontend: true } }
    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy web, Authorization is required')
  })

  describe('byo s3 credentials', () => {
    const byoConfig = () => ({
      ow: { namespace: 'ns' },
      s3: {
        folder: 'somefolder',
        creds: { accessKeyId: 'fake', secretAccessKey: 'fake', params: { Bucket: 'bucket' } }
      },
      app: { hasFrontend: true }
    })

    test('empties the s3 folder without an auth token and ignores the empty result', async () => {
      const config = byoConfig()
      mockRemoteStorageInstance.folderExists.mockResolvedValue(true)
      mockRemoteStorageInstance.emptyFolder.mockResolvedValue(undefined)

      await expect(undeployWeb(config)).resolves.toBeUndefined()

      expect(RemoteStorage).toHaveBeenCalledWith(config.s3.creds)
      expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith(undefined, 'somefolder/', config)
      expect(mockRemoteStorageInstance.emptyFolder).toHaveBeenCalledWith(undefined, 'somefolder/', config)
    })

    test('throws with the s3 folder name if there is no deployment', async () => {
      mockRemoteStorageInstance.folderExists.mockResolvedValue(false)

      await expect(undeployWeb(byoConfig())).rejects.toThrow('there is no deployment for somefolder')
      expect(mockRemoteStorageInstance.emptyFolder).not.toHaveBeenCalled()
    })
  })

  test('throws if remoteStorage emptyFolder fails', async () => {
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
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    mockRemoteStorageInstance.folderExists.mockResolvedValue(true)
    mockRemoteStorageInstance.emptyFolder.mockResolvedValue(false)

    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy static files, failed to delete deployment files')
  })
})
