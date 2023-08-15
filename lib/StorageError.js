/*
Copyright 2023 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { ErrorWrapper, createUpdater } = require('@adobe/aio-lib-core-errors').AioCoreSDKErrorWrapper
const logger = require('@adobe/aio-lib-core-logging')('@adobe/aio-lib-web', { provider: 'debug' })

const codes = {}
const messages = new Map()

const Updater = createUpdater(
  codes,
  messages
)

const E = ErrorWrapper(
  'WebStorageError',
  'WebLib',
  Updater
)

E('ERROR_INVALID_HEADER_NAME', '`%s` is not a valid response header name')
E('ERROR_INVALID_HEADER_VALUE', '`%s` is not a valid response header value for `%s`')

function logAndThrow (e) {
  logger.error(JSON.stringify(e, null, 2))
  throw e
}

module.exports = {
  codes,
  messages,
  logAndThrow
}
