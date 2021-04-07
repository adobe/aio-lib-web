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

jest.mock('../../lib/getS3Creds')
const getS3Credentials = require('../../lib/getS3Creds')
getS3Credentials.mockResolvedValue('fakecreds')

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
    getS3Credentials.mockClear()
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(undeployWeb()).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: 'nothing-here' })).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot undeploy web')
  })

  test('calls getS3Credentials and empties folder', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth: 'password'
      },
      s3: {
        creds: 'fakes3creds',
        tvmUrl: 'url',
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
    await undeployWeb(config)
    expect(getS3Credentials).toHaveBeenCalledWith(config)
    expect(RemoteStorage).toHaveBeenCalledWith('fakecreds')
    expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith('somefolder')
    expect(mockRemoteStorageInstance.emptyFolder).toHaveBeenCalledWith('somefolder')
  })

  test('throws if remoteStorage folder does not exist', async () => {
    const config = {
      ow: {
        namespace: 'ns',
        auth: 'password'
      },
      s3: {
        credsCacheFile: 'file',
        tvmUrl: 'url',
        folder: 'somefolder'
      },
      app: {
        hasFrontend: true
      },
      web: {
        distProd: 'dist'
      }
    }
    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy static files')
    expect(getS3Credentials).toHaveBeenCalledWith(config)
    expect(RemoteStorage).toHaveBeenCalledWith('fakecreds')
    expect(mockRemoteStorageInstance.folderExists).toHaveBeenCalledWith('somefolder')
    expect(mockRemoteStorageInstance.emptyFolder).not.toHaveBeenCalled()
  })
})
