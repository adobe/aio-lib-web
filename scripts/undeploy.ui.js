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

const aws = require('aws-sdk')

// This should eventually be fully covered by `aio runtime deploy`
class UndeployUI extends CNAScript {
  async run () {
    const taskName = `Undeploy static files`
    this.emit('start', taskName)

    const creds = this.config.s3.creds ||
      await utils.getTmpS3Credentials(
        this.config.s3.tvmUrl,
        this.config.ow.namespace,
        this.config.ow.auth,
        this.config.s3.credsCacheFile)
    const s3 = new aws.S3(creds)
    console.log(this.config.s3)

    if (!(await utils.s3.folderExists(s3, this.config.s3.folder))) {
      throw new Error(`Cannot undeploy static files, S3 folder ${this.config.s3.folder} does not exist.`)
    }

    await utils.s3.emptyFolder(s3, this.config.s3.folder)

    this.emit('end', taskName)
  }
}

CNAScript.runOrExport(module, UndeployUI)
