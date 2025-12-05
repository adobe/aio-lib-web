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
const { createFetch } = require('@adobe/aio-lib-core-networking')
const { codes, logAndThrow } = require('./StorageError')

module.exports = async function invalidateCache (deployApiHost, namespace, tokenHeader) {
  const fetch = createFetch()

  const url = `https://${deployApiHost}/cdn-api/namespaces/${namespace}/cache`
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: tokenHeader
      }
    })
    if (!response.ok) {
      logAndThrow(new codes.ERROR_CACHE_INVALIDATION({ messageValues: [`${url} ${response.status} ${response.statusText} ${await response.text()}`], sdkDetails: {} }))
    }
    return response.json()
  } catch (error) {
    logAndThrow(new codes.ERROR_CACHE_INVALIDATION({ messageValues: [`${url} ${error.message}`], sdkDetails: {} }))
  }
}
