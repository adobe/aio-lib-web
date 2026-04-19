/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

jest.mock('@adobe/aio-lib-core-networking', () => ({
  createFetch: jest.fn()
}))

const { createFetch } = require('@adobe/aio-lib-core-networking')
const invalidateCache = require('../../lib/invalidate-cache')

describe('invalidate-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('succeeds when API returns ok', async () => {
    const mockJson = { status: 'ok' }
    const mockFetch = jest.fn(async () => ({ ok: true, json: async () => mockJson }))
    createFetch.mockReturnValue(mockFetch)

    const host = 'deploy.example.com'
    const ns = 'my-ns'
    const header = 'Bearer token'

    await expect(invalidateCache(host, ns, header)).resolves.toEqual(mockJson)
    expect(mockFetch).toHaveBeenCalledWith(`https://${host}/cdn-api/namespaces/${ns}/cache`, expect.objectContaining({
      method: 'DELETE',
      headers: { Authorization: header }
    }))
  })

  test('throws wrapped error when response not ok', async () => {
    const mockFetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom'
    }))
    createFetch.mockReturnValue(mockFetch)

    const host = 'deploy.example.com'
    const ns = 'my-ns'
    const header = 'Bearer token'

    await expect(() => invalidateCache(host, ns, header)).toThrowWithMessageContaining([
      '[WebLib:ERROR_CACHE_INVALIDATION]',
      'failed to invalidate cache',
      '500'
    ])
  })

  test('throws wrapped error when network fails', async () => {
    const mockFetch = jest.fn(async () => { throw new Error('network down') })
    createFetch.mockReturnValue(mockFetch)

    const host = 'deploy.example.com'
    const ns = 'my-ns'
    const header = 'Bearer token'

    await expect(() => invalidateCache(host, ns, header)).toThrowWithMessageContaining([
      '[WebLib:ERROR_CACHE_INVALIDATION]',
      'failed to invalidate cache',
      'network down'
    ])
  })
})
