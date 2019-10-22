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

const CNAScripts = require('../..')

// mocks
const mockAIOConfig = require('@adobe/aio-lib-core-config')
const mockFs = require('fs-extra')
jest.mock('fs-extra')

let scripts
beforeAll(async () => {
  // create test app and switch cwd
  await global.mockFS()
  await global.setTestAppAndEnv()
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await CNAScripts({})
})

beforeEach(async () => {
  mockFs.readFileSync.mockReturnValue(`
  packages:
    __CNA_PACKAGE__:
      license: Apache-2.0`)
})

afterEach(async () => {
  jest.resetAllMocks()
})

afterAll(async () => {
  await global.resetFS()
})

test('auth_code', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'code', oauth: { persistence: 'yes' } })
  await scripts.addAuth()
  expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
  expect(mockFs.writeFile.mock.calls[0][0]).toContain('manifest.yml')
  expect(mockFs.writeFile.mock.calls[0][1]).toEqual(`packages:
  __CNA_PACKAGE__:
    license: Apache-2.0
  myauthp:
    sequences:
      authenticate:
        actions: >-
          myauthp-shared/login,/adobeio/cache/encrypt,/adobeio/cache/persist,myauthp-shared/success
        web: 'yes'
    dependencies:
      myauthp-shared:
        location: /adobeio/oauth
        inputs:
          auth_provider: adobe-oauth2
          auth_provider_name: adobe
          client_id: change-me
          client_secret: change-me
          scopes: 'openid,AdobeID'
          persistence: true
          callback_url: 'https://adobeioruntime.net/api/v1/web/fake_ns/myauthp/authenticate'
          redirect_url: 'https://www.adobe.com'
          cookie_path: fake_ns
          cache_namespace: fake_ns
          cache_package: mycachep-shared
`)
})

test('jwt', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'jwt', 'jwt-auth': { persistence: 'yes', jwt_payload: { http: true } } })
  await scripts.addAuth()
  expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
  expect(mockFs.writeFile.mock.calls[0][0]).toContain('manifest.yml')
  expect(mockFs.writeFile.mock.calls[0][1]).toEqual(`packages:
  __CNA_PACKAGE__:
    license: Apache-2.0
  myjwtauthp:
    sequences:
      authenticate:
        actions: 'myjwtauthp-shared/jwtauth,/adobeio/cache/persist'
        web: 'yes'
    dependencies:
      myjwtauthp-shared:
        location: /adobeio/oauth
        inputs:
          jwt_client_id: change-me
          jwt_client_secret: change-me
          technical_account_id: change-me
          org_id: change-me
          meta_scopes: '["http"]'
          private_key: '["change-me"]'
          persistence: true
          cache_namespace: fake_ns
          cache_package: myjwtcachep-shared
`)
})

test('invalid ims_auth_type', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'invalid' })
  await expect(scripts.addAuth.bind(this)).toThrowWithMessageContaining(['Invalid value for property ims_auth_type. Allowed values are code and jwt.'])
})

test('writeFile error with code', async () => {
  mockFs.writeFile = jest.fn((file, manifest, err) => err('code failed'))
  await expect(scripts.addAuth()).rejects.toMatch('code failed')
})

test('writeFile error with jwt', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'jwt' })
  mockFs.writeFile = jest.fn((file, manifest, err) => err('jwt failed'))
  await expect(scripts.addAuth()).rejects.toMatch('jwt failed')
})
