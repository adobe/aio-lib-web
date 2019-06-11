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

const fs = require('fs-extra')
const path = require('path')

class DeployUI extends CNAScript {
  async run () {
    const taskName = `Deploy static files`
    this.emit('start', taskName)

    const dist = this.config.web.distProd
    if (!(await fs.exists(dist)) ||
      !(await fs.stat(dist)).isDirectory() ||
      !(await fs.readdir(dist)).length === 0) {
      throw new Error(`missing files in ${this._relApp(dist)}, maybe you forgot to build your UI ?`)
    }

    const creds = this.config.s3.creds ||
        (await new TVMClient({
          tvmUrl: this.config.s3.tvmUrl,
          owNamespace: this.config.ow.namespace,
          owAuth: this.config.ow.auth,
          cacheCredsFile: this.config.s3.credsCacheFile
        }).getCredentials())
    const remoteStorage = new RemoteStorage(creds)

    if (await remoteStorage.folderExists(this.config.s3.folder)) {
      this.emit('warning', `An already existing deployment for version ${this.config.app.version} will be overwritten`)
      await remoteStorage.emptyFolder(this.config.s3.folder)
    }
    await remoteStorage.uploadDir(dist, this.config.s3.folder, f => this.emit('progress', path.basename(f)))

    const url = `https://s3.amazonaws.com/${creds.params.Bucket}/${this.config.s3.folder}/index.html`
    this.emit('resource', url) // a bit hacky
    this.emit('end', taskName)
    return url
  }
}

CNAScript.runOrExport(module, DeployUI)
