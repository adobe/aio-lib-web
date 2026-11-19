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

/**
 * Deletes the deployed web assets under `<namespace>/<web.path>/`, or under the namespace root if `web.path` is not set.
 *
 * @param {object} config the app config
 * @param {Function} [log] not used, accepted to match deployWeb
 * @param {object} [options] undeploy options
 * @param {Array<string>} [options.keepPaths] web paths of other frontends in the namespace, their files are not deleted
 */
const undeployWeb = async (config, log, options = {}) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot undeploy web, app has no frontend or config is invalid')
  }

  const creds = await getS3Credentials(config)

  const remoteStorage = new RemoteStorage(creds)

  const folder = config.web.path ? `${config.s3.folder}/${config.web.path}` : config.s3.folder

  if (!(await remoteStorage.folderExists(folder + '/'))) {
    throw new Error(`cannot undeploy static files, there is no deployment for ${folder}`)
  }

  const keepFolders = (options.keepPaths || []).map(keepPath => `${config.s3.folder}/${keepPath}/`)
  await remoteStorage.emptyFolder(folder + '/', keepFolders)
}

module.exports = undeployWeb
