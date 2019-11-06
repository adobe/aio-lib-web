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

const BaseScript = require('../lib/abstract-script')
const TvmClient = require('@adobe/aio-lib-core-tvm')
const RemoteStorage = require('../lib/remote-storage')

const fs = require('fs-extra')
const path = require('path')

class DeployUI extends BaseScript {
  async run () {
    const taskName = 'Deploy static files'
    this.emit('start', taskName)

    if (!this.config.app.hasFrontend) throw new Error('cannot deploy UI, app has no frontend')

    const dist = this.config.web.distProd
    if (!(fs.existsSync(dist)) ||
        !(fs.statSync(dist)).isDirectory() ||
        !(fs.readdirSync(dist)).length === 0) {
      throw new Error(`missing files in ${this._relApp(dist)}, maybe you forgot to build your UI ?`)
    }

    const creds = this.config.s3.creds ||
        await (await TvmClient.init({
          ow: {
            namespace: this.config.ow.namespace,
            auth: this.config.ow.auth
          },
          apiUrl: this.config.s3.tvmUrl,
          cacheFile: this.config.s3.credsCacheFile
        })).getAwsS3Credentials()
    const remoteStorage = new RemoteStorage(creds)

    if (await remoteStorage.folderExists(this.config.s3.folder)) {
      this.emit('warning', `an already existing deployment for version ${this.config.app.version} will be overwritten`)
      await remoteStorage.emptyFolder(this.config.s3.folder)
    }
    await remoteStorage.uploadDir(dist, this.config.s3.folder, f => this.emit('progress', path.basename(f)))

    const url = `https://${this.config.ow.namespace}.${this.config.app.hostname}/${this.config.s3.folder}/index.html`
    this.emit('end', taskName, url)
    return url
  }
}

module.exports = DeployUI
