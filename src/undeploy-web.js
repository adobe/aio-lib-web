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

const undeployWeb = async (config) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot undeploy web, app has no frontend or config is invalid')
  }

  // byo: user supplied AWS S3 credentials, files are deleted directly from the bucket
  const byoCreds = config.s3 && config.s3.creds
  let bearerToken
  if (!byoCreds) {
    bearerToken = await config?.ow?.auth_handler?.getAuthHeader()
    if (!bearerToken) {
      throw new Error('cannot undeploy web, Authorization is required')
    }
  }

  const remoteStorage = byoCreds ? new RemoteStorage(byoCreds) : new RemoteStorage()
  const folderPrefix = byoCreds ? config.s3.folder + '/' : '/'

  if (!(await remoteStorage.folderExists(bearerToken, folderPrefix, config))) {
    throw new Error(`cannot undeploy static files, there is no deployment for ${byoCreds ? config.s3.folder : config.ow.namespace}`)
  }

  const deleted = await remoteStorage.emptyFolder(bearerToken, folderPrefix, config)
  // the byo s3 flow does not return a result
  if (!byoCreds && !deleted) {
    throw new Error('cannot undeploy static files, failed to delete deployment files')
  }
}

module.exports = undeployWeb
