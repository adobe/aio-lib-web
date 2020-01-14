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
const utils = require('../lib/utils')

const fs = require('fs-extra')
const path = require('path')

const cloneDeep = require('lodash.clonedeep')

const OpenWhisk = require('openwhisk')

// This should eventually be fully covered by `aio runtime deploy`
class DeployActions extends BaseScript {
  async run (args = [], deployConfig = {}) {
    const taskName = 'Deploy actions'
    this.emit('start', taskName)

    // checks
    /// a. missing credentials
    utils.checkOpenWhiskCredentials(this.config)
    /// b. missing build files
    const dist = this.config.actions.dist
    if (!(fs.pathExistsSync(dist)) ||
        !(fs.lstatSync(dist)).isDirectory() ||
        !(fs.readdirSync(dist)).length === 0) {
      throw new Error(`missing files in ${this._relApp(dist)}, maybe you forgot to build your actions ?`)
    }

    // 1. rewrite wskManifest config
    const manifest = cloneDeep(this.config.manifest.full)
    const manifestPackage = manifest.packages[this.config.manifest.packagePlaceholder]
    manifestPackage.version = this.config.app.version
    const relDist = this._relApp(this.config.actions.dist)
    await Promise.all(Object.entries(manifestPackage.actions).map(async ([name, action]) => {
      // change path to built action
      action.function = path.join(relDist, name + '.zip')
    }))
    // replace package name
    manifest.packages[this.config.ow.package] = manifest.packages[this.config.manifest.packagePlaceholder]
    delete manifest.packages[this.config.manifest.packagePlaceholder]

    // 2. deploy manifest
    const owClient = OpenWhisk({
      apihost: this.config.ow.apihost,
      apiversion: this.config.ow.apiversion,
      api_key: this.config.ow.auth,
      namespace: this.config.ow.namespace
    })
    const deployedEntities = await utils.deployWsk(
      this.config.ow.package,
      this.config.manifest.src,
      manifest,
      owClient,
      this.emit.bind(this, 'progress'),
      deployConfig.filterEntities
    )

    this.emit('end', taskName, deployedEntities)
    return deployedEntities
  }
}

module.exports = DeployActions
