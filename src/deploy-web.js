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

const RemoteStorage = require('../lib/remote-storage')
const getS3Credentials = require('../lib/getS3Creds')

const fs = require('fs-extra')
const path = require('path')

/**
 * Deploys the built web assets to `<namespace>/<web.path>/`, or to the namespace root if `web.path` is not set.
 *
 * @param {object} config the app config
 * @param {Function} [log] progress logger
 * @param {object} [options] deploy options
 * @param {Array<string>} [options.keepPaths] web paths of other frontends in the namespace, their files are not deleted
 * @returns {Promise<string>} the URL of the deployed index.html
 */
const deployWeb = async (config, log, options = {}) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot deploy web, app has no frontend or config is invalid')
  }

  /// build files
  const dist = config.web.distProd
  if (!fs.existsSync(dist) ||
    !fs.lstatSync(dist).isDirectory() ||
    (fs.readdirSync(dist).length === 0)) {
    // note: removed this._relApp(dist)
    throw new Error(`missing files in ${dist}, maybe you forgot to build your UI ?`)
  }

  const creds = await getS3Credentials(config)

  const remoteStorage = new RemoteStorage(creds)
  const folder = config.web.path ? `${config.s3.folder}/${config.web.path}` : config.s3.folder
  const exists = await remoteStorage.folderExists(folder + '/')

  if (exists) {
    if (log) {
      log('warning: an existing deployment will be overwritten')
    }
    const keepFolders = (options.keepPaths || []).map(keepPath => `${config.s3.folder}/${keepPath}/`)
    await remoteStorage.emptyFolder(folder + '/', keepFolders)
  }
  const _log = log ? (f) => log(`deploying ${path.relative(dist, f)}`) : null
  await remoteStorage.uploadDir(dist, folder, config, _log)

  const indexPath = config.web.path ? `${config.web.path}/index.html` : 'index.html'
  const url = `https://${config.ow.namespace}.${config.app.hostname}/${indexPath}`
  return url
}

module.exports = deployWeb
