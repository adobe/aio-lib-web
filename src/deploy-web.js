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

const RemoteStorage = require('../lib/remote-storage')
const getS3Credentials = require('../lib/getS3Creds')
const invalidateCache = require('../lib/invalidate-cache')

const fs = require('fs-extra')
const path = require('path')

const deployWeb = async (config, log) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot deploy web, app has no frontend or config is invalid')
  }

  if (!config.web.namespace || !config.web.apihost || !config.web.auth_handler) {
    throw new Error('cannot deploy web, config is missing "web.namespace", "web.apihost", or "web.auth_handler" fields')
  }

  /// build files
  const dist = config.web.distProd
  if (!fs.existsSync(dist) ||
    !fs.lstatSync(dist).isDirectory() ||
    (fs.readdirSync(dist).length === 0)) {
    // note: removed this._relApp(dist)
    throw new Error(`missing files in ${dist}, maybe you forgot to build your UI ?`)
  }

  /// deploy
  // 1. invalidate cache

  // this will trigger a login
  const authHeader = await config.web.auth_handler()
  const namespace = config.web.namespace
  const apihost = config.web.apihost // this is the deploy service apihost
  await invalidateCache(apihost, namespace, authHeader)

  // 2. upload files
  const creds = await getS3Credentials(config)

  const remoteStorage = new RemoteStorage(creds)
  const exists = await remoteStorage.folderExists(config.s3.folder + '/')

  if (exists) {
    if (log) {
      log('warning: an existing deployment will be overwritten')
    }
    await remoteStorage.emptyFolder(config.s3.folder + '/')
  }
  const _log = log ? (f) => log(`deploying ${path.relative(dist, f)}`) : null
  await remoteStorage.uploadDir(dist, config.s3.folder, config, _log)

  const url = `https://${config.ow.namespace}.${config.app.hostname}/index.html`
  return url
}

module.exports = deployWeb
