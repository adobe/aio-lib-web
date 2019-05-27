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
const utils = require('../lib/utils')

const fs = require('fs')
const path = require('path')
const aws = require('aws-sdk')

class DeployUI extends CNAScript {
  async run () {
    const taskName = `Deploy static files`
    this.emit('start', taskName)

    const dist = this.config.web.distProd
    if (!fs.existsSync(dist) ||
        !fs.statSync(dist).isDirectory() ||
        fs.readdirSync(dist).length === 0) {
      throw new Error(`${this._relCwd(dist)} should not be empty, maybe you forgot to build your UI ?`)
    }

    const creds = this.config.s3.creds ||
      await utils.getTmpS3Credentials(
        this.config.s3.tvmUrl,
        this.config.ow.namespace,
        this.config.ow.auth,
        this.config.s3.credsCacheFile)
    const s3 = new aws.S3(creds)

    if (await utils.s3.folderExists(s3, this.config.s3.folder)) {
      this.emit('warning', `An already existing deployment for version ${this.config.app.version} will be overwritten`)
      await utils.s3.emptyFolder(s3, this.config.s3.folder)
    }
    await utils.s3.uploadDir(s3, this.config.s3.folder, dist, f => this.emit('progress', path.basename(f)))

    const url = `https://s3.amazonaws.com/${creds.params.Bucket}/${this.config.s3.folder}/index.html`
    this.emit('resource', url) // a bit hacky
    this.emit('end', taskName)
    return url
  }
}

CNAScript.runOrExport(module, DeployUI)
