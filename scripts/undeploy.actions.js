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

const cloneDeep = require('lodash.clonedeep')

class UndeployActions extends BaseScript {
  async run () {
    if (!this.config.app.hasBackend) throw new Error('cannot undeploy actions, app has no backend')

    const taskName = 'Undeploy actions'
    this.emit('start', taskName)

    // 0. check credentials
    utils.checkOpenWhiskCredentials(this.config)

    // 1. rewrite wskManifest config
    const manifest = cloneDeep(this.config.manifest.full)
    // replace package name
    let packageName = null
    if (manifest.packages[this.config.manifest.packagePlaceholder]) {
      manifest.packages[this.config.ow.package] = manifest.packages[this.config.manifest.packagePlaceholder]
      delete manifest.packages[this.config.manifest.packagePlaceholder]
      const manifestPackage = manifest.packages[this.config.ow.package]
      manifestPackage.version = this.config.app.version
      packageName = this.config.ow.package
    } else {
      packageName = Object.keys(manifest.packages)[0]
    }

    // 2. undeploy
    const owOptions = {
      apihost: this.config.ow.apihost,
      apiversion: this.config.ow.apiversion,
      api_key: this.config.ow.auth,
      namespace: this.config.ow.namespace
    }
    await utils.undeployWsk(packageName, manifest, owOptions, this.emit.bind(this, 'progress'))

    this.emit('end', taskName)
  }
}

module.exports = UndeployActions
