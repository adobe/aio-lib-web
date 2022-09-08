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

const getS3Credentials = require('../../lib/getS3Creds')

const fakeReturnedTvmCreds = { fake: 'tvmcreds' } // from __mocks__
const mockTVM = require('@adobe/aio-lib-core-tvm')

describe('getS3Credentials', () => {
  beforeEach(() => {
    mockTVM.init.mockClear()
  })

  test('throw when missing required args', async () => {
    const expectedErrorMessage =
      'Please check your .env file to ensure your credentials are correct.'

    await expect(getS3Credentials({}))
      .rejects.toThrow(expectedErrorMessage)

    await expect(getS3Credentials({ ow: { namespace: 'ns' }, s3: {} }))
      .rejects.toThrow(expectedErrorMessage)

    await expect(getS3Credentials({ ow: { auth: 'auth' } }))
      .rejects.toThrow(expectedErrorMessage)
  })

  test('returns s3.creds if defined', async () => {
    const fakeCreds = { fake: 's3creds' }
    await expect(getS3Credentials({ ow: { namespace: 'ns', auth: 'auth' }, s3: { creds: fakeCreds } }))
      .resolves.toEqual(fakeCreds)
    expect(mockTVM.init).not.toHaveBeenCalled()
  })

  test('gets credentials from tvm', async () => {
    await expect(getS3Credentials({ ow: { namespace: 'ns', auth: 'auth' } }))
      .resolves.toEqual(fakeReturnedTvmCreds)
    expect(mockTVM.init).toHaveBeenCalledWith({
      apiUrl: undefined,
      cacheFile: undefined,
      ow: { auth: 'auth', namespace: 'ns' }
    })
  })

  test('gets credentials from tvm with custom tvmurl', async () => {
    await expect(getS3Credentials({ ow: { namespace: 'ns', auth: 'auth' }, s3: { tvmUrl: 'custom' } }))
      .resolves.toEqual(fakeReturnedTvmCreds)
    expect(mockTVM.init).toHaveBeenCalledWith({
      apiUrl: 'custom',
      cacheFile: undefined,
      ow: { auth: 'auth', namespace: 'ns' }
    })
  })

  test('gets credentials from tvm with custom credsCacheFile', async () => {
    await expect(getS3Credentials({ ow: { namespace: 'ns', auth: 'auth' }, s3: { credsCacheFile: 'custom' } }))
      .resolves.toEqual(fakeReturnedTvmCreds)
    expect(mockTVM.init).toHaveBeenCalledWith({
      apiUrl: undefined,
      cacheFile: 'custom',
      ow: { auth: 'auth', namespace: 'ns' }
    })
  })
})
