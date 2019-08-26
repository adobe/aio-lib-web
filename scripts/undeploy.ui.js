#!/usr/bin/env node
/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const CNAScript = require('../lib/abstract-script')
const TVMClient = require('../lib/tvm-client')
const RemoteStorage = require('../lib/remote-storage')

class UndeployUI extends CNAScript {
  async run () {
    const taskName = `Undeploy static files`
    this.emit('start', taskName)

    const creds = this.config.s3.creds ||
        (await new TVMClient({
          tvmUrl: this.config.s3.tvmUrl,
          owNamespace: this.config.ow.namespace,
          owAuth: this.config.ow.auth,
          cacheCredsFile: this.config.s3.credsCacheFile
        }).getCredentials())
    const remoteStorage = new RemoteStorage(creds)

    if (!(await remoteStorage.folderExists(this.config.s3.folder))) {
      throw new Error(`Cannot undeploy static files, S3 folder ${this.config.s3.folder} does not exist.`)
    }

    await remoteStorage.emptyFolder(this.config.s3.folder)

    this.emit('end', taskName)
  }
}

module.exports = UndeployUI
