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
const getTvmCredentials = require('../../lib/getTvmCreds')
jest.mock('../../lib/getTvmCreds')
const RemoteStorage = require('../../lib/remote-storage')
jest.mock('../../lib/remote-storage', () => {
  return jest.fn().mockImplementation(() => {
    return {
      emptyFolder: jest.fn(),
      folderExists: jest.fn().mockResolvedValue(true),
      uploadDir: jest.fn()
    }
  })
})

describe('undeploy-web', () => {
  beforeEach(() => {
    RemoteStorage.mockClear()
    jest.restoreAllMocks()
  })

  test('throws if config does not have an app, or frontEnd', async () => {
    await expect(undeployWeb()).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: 'nothing-here' })).rejects.toThrow('cannot undeploy web')
    await expect(undeployWeb({ app: { hasFrontEnd: false } })).rejects.toThrow('cannot undeploy web')
  })

  test('succeeds with proper config', async () => {
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
    await expect(undeployWeb(config)).resolves.toBe(undefined)
    expect(getTvmCredentials).not.toHaveBeenCalled()
  })

  test('throws if remoteStorage folder does not exist', async () => {
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
        hasFrontend: true
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
    await expect(undeployWeb(config)).rejects.toThrow('cannot undeploy static files')
    expect(getTvmCredentials).toHaveBeenCalled()
  })
})
