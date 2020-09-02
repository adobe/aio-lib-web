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

const getTvmCredentials = require('../../lib/getTvmCreds')

describe('getTvmCredentials', () => {
  beforeEach(() => {
    // restores all spies
    jest.restoreAllMocks()
  })

  test('throw when missing required args', async () => {
    // const creds = getTvmCredentials()
    await expect(getTvmCredentials())
      .rejects.toThrow('Missing required argument')

    await expect(getTvmCredentials('ns'))
      .rejects.toThrow('Missing required argument')

    await expect(getTvmCredentials('ns', 'auth'))
      .rejects.toThrow('Missing required argument')

    await expect(getTvmCredentials('ns', 'auth', 'apiUrl'))
      .rejects.toThrow('Missing required argument')

    const creds = await getTvmCredentials('ns', 'auth', 'http://apiUrl', 'cacheFile')

    expect(creds).toBe('getAwsS3Credentials')
  })
})
