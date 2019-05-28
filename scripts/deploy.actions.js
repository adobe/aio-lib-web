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
const yaml = require('js-yaml')

// This should eventually be fully covered by `aio runtime deploy`
class DeployActions extends CNAScript {
  async run () {
    const taskName = `Deploy actions`
    this.emit('start', taskName)

    const dist = this.config.actions.dist
    if (!fs.existsSync(dist) ||
        !fs.statSync(dist).isDirectory() ||
        fs.readdirSync(dist).length === 0) {
      throw new Error(`${this._relCwd(dist)} should not be empty, maybe you forgot to build your actions ?`)
    }

    // 1. rewrite wskManifest config
    const manifest = { ...this.config.manifest.full }
    const manifestPackage = manifest.packages[this.config.manifest.packagePlaceholder]
    manifestPackage.version = this.config.app.version
    const relDist = this._relApp(this.config.actions.dist)
    Object.entries(manifestPackage.actions).forEach(([name, action]) => {
      const actionPath = this._absApp(action.function)
      // change path to built action
      if (fs.statSync(actionPath).isDirectory()) {
        action.function = path.join(relDist, name + '.zip')
      } else {
        action.function = path.join(relDist, name + '.js')
        action.main = 'module.exports.' + (action.main || 'main')
      }
    })
    // replace package name
    const manifestString = yaml.safeDump(manifest)
      .replace(this.config.manifest.packagePlaceholder, this.config.ow.package)
    // write the new wskManifest yaml
    const distManifestFile = this.config.manifest.dist
    fs.writeFileSync(distManifestFile, manifestString)

    // 2. invoke aio runtime deploy command
    await utils.spawnAioRuntimeDeploy(distManifestFile)

    // 3. show list of deployed actions
    Object.keys(this.config.manifest.package.actions).forEach(an => {
      // emulates progress
      this.emit('progress', this.config.actions.urls[an])
    })

    this.emit('end', taskName)
  }
}

CNAScript.runOrExport(module, DeployActions)
