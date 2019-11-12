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
const { vol, fs } = global.mockFs()

const AppScripts = require('../..')
const yaml = require('js-yaml')

// mocks
const mockAIOConfig = require('@adobe/aio-lib-core-config')

let scripts
beforeEach(async () => {
  // create test app and switch cwd
  global.loadFs(vol, 'sample-app')
  mockAIOConfig.get.mockReturnValue(global.fakeConfig.tvm)
  scripts = await AppScripts({})
})

afterEach(() => global.cleanFs(vol))

test('Should add config into manifest for ims_auth_type=code', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'code', oauth: { persistence: 'yes' } })
  await scripts.addAuth()

  // expect the source manifest to contain auth config
  const manifest = yaml.safeLoad(fs.readFileSync(scripts._config.manifest.src, 'utf8'))
  expect(manifest.packages).toEqual(expect.objectContaining({
    myauthp: {
      sequences: {
        authenticate: {
          actions: 'myauthp-shared/login,mycachep-shared/encrypt,mycachep-shared/persist,myauthp-shared/success',
          web: 'yes'
        }
      },
      dependencies: {
        'myauthp-shared': {
          location: '/adobeio/oauth',
          inputs: {
            auth_provider: 'adobe-oauth2',
            auth_provider_name: 'adobe',
            client_id: 'change-me',
            client_secret: 'change-me',
            scopes: 'openid,AdobeID',
            persistence: true,
            callback_url: 'https://adobeioruntime.net/api/v1/web/fake_ns/myauthp/authenticate',
            redirect_url: 'https://www.adobe.com',
            cookie_path: 'fake_ns',
            cache_namespace: 'fake_ns',
            cache_package: 'mycachep-shared'
          }
        },
        'mycachep-shared': {
          location: '/adobeio/cache'
        }
      }
    }
  }))
})

test('jwt', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'jwt', 'jwt-auth': { persistence: 'yes', jwt_payload: { http: true } } })
  await scripts.addAuth()

  // expect the source manifest to contain auth config
  const manifest = yaml.safeLoad(fs.readFileSync(scripts._config.manifest.src, 'utf8'))
  expect(manifest.packages).toEqual(expect.objectContaining({
    myjwtauthp: {
      sequences: {
        authenticate: {
          actions: 'myjwtauthp-shared/jwtauth,myjwtcachep-shared/persist',
          web: 'yes'
        }
      },
      dependencies: {
        'myjwtauthp-shared': {
          location: '/adobeio/oauth',
          inputs: {
            jwt_client_id: 'change-me',
            jwt_client_secret: 'change-me',
            technical_account_id: 'change-me',
            org_id: 'change-me',
            meta_scopes: '["http"]',
            private_key: '["change-me"]',
            persistence: true,
            cache_namespace: 'fake_ns',
            cache_package: 'myjwtcachep-shared'
          }
        },
        'myjwtcachep-shared': {
          location: '/adobeio/cache'
        }
      }
    }
  }))
})

test('invalid ims_auth_type', async () => {
  mockAIOConfig.get.mockReturnValue({ runtime: global.fakeConfig.tvm.runtime, cna: global.fakeConfig.tvm.cna, ims_auth_type: 'invalid' })
  await expect(scripts.addAuth.bind(this)).toThrowWithMessageContaining(['Invalid value for property ims_auth_type. Allowed values are code and jwt.'])
})
