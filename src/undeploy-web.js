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

const undeployWeb = async (config) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot undeploy web, app has no frontend or config is invalid')
  }

  // Use the same default cache file as TvmClient
  const credsCacheFile = (config.s3 && config.s3.credsCacheFile) || '.aws.tmp.creds.json'

  try {
    const creds = await getS3Credentials(config)

    const remoteStorage = new RemoteStorage(creds)

    if (!(await remoteStorage.folderExists(config.s3.folder + '/'))) {
      throw new Error(`cannot undeploy static files, there is no deployment for ${config.s3.folder}`)
    }

    await remoteStorage.emptyFolder(config.s3.folder + '/')
  } finally {
    // Cleanup TVM credentials cache file
    if (credsCacheFile && fs.existsSync(credsCacheFile)) {
      try {
        fs.removeSync(credsCacheFile)
      } catch (err) {
        // Ignore cleanup errors - don't fail undeployment if cleanup fails
      }
    }
  }
}

module.exports = undeployWeb
