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

// This should eventually be fully covered by `aio runtime deploy`
class DeployActions extends BaseScript {
  /**
   * runs the command
   *
   * @param {Array} [args=[]]
   * @param {object} [deployConfig={}]
   * @param {object} [deployConfig.filterEntities] add filters to deploy only specified OpenWhisk entities
   * @param {Array} [deployConfig.filterEntities.actions] filter list of actions to deploy, e.g. ['name1', ..]
   * @param {Array} [deployConfig.filterEntities.sequences] filter list of sequences to deploy, e.g. ['name1', ..]
   * @param {Array} [deployConfig.filterEntities.triggers] filter list of triggers to deploy, e.g. ['name1', ..]
   * @param {Array} [deployConfig.filterEntities.rules] filter list of rules to deploy, e.g. ['name1', ..]
   * @param {Array} [deployConfig.filterEntities.apis] filter list of apis to deploy, e.g. ['name1', ..]
   * @param {Array} [deployConfig.filterEntities.dependencies] filter list of package dependencies to deploy, e.g. ['name1', ..]
   * @returns
   * @memberof DeployActions
   */
  async run (args = [], deployConfig = {}) {
    if (!this.config.app.hasBackend) throw new Error('cannot deploy actions, app has no backend')
    const taskName = 'Deploy actions'
    this.emit('start', taskName)

    const isLocalDev = deployConfig.isLocalDev

    // checks
    /// a. missing credentials
    utils.checkOpenWhiskCredentials(this.config)
    /// b. missing build files
    const dist = this.config.actions.dist
    if (
      (!deployConfig.filterEntities || deployConfig.filterEntities.actions) &&
      (!fs.pathExistsSync(dist) || !fs.lstatSync(dist).isDirectory() || !fs.readdirSync(dist).length === 0)
    ) {
      throw new Error(`missing files in ${this._relApp(dist)}, maybe you forgot to build your actions ?`)
    }

    // 1. rewrite wskManifest config
    const manifest = cloneDeep(this.config.manifest.full)
    const manifestPackage = cloneDeep(this.config.manifest.package)
    manifestPackage.version = this.config.app.version
    const relDist = this._relApp(this.config.actions.dist)

    Object.keys(manifestPackage.actions).forEach(name => {
      // change path to built action
      manifestPackage.actions[name].function = path.join(relDist, name + '.zip')
    })

    // 2. deploy manifest
    const owOptions = {
      apihost: this.config.ow.apihost,
      apiversion: this.config.ow.apiversion,
      api_key: this.config.ow.auth,
      namespace: this.config.ow.namespace
    }
    let deployedEntities = await utils.deployWsk(
      this.config.ow.package,
      this.config.manifest.src,
      manifest,
      owOptions,
      this.emit.bind(this, 'progress'),
      deployConfig.filterEntities
    )

    deployedEntities = deployedEntities || {}

    // enrich actions array with urls
    if (Array.isArray(deployedEntities.actions)) {
      const actionUrlsFromManifest = utils.getActionUrls(this.config, this.config.actions.devRemote, isLocalDev)
      deployedEntities.actions = deployedEntities.actions.map(a => {
        // in deployedEntities.actions, names are <package>/<action>
        const url = actionUrlsFromManifest[a.name.split('/')[1]]
        if (url) {
          a.url = url
        }
        return a
      })
    }

    this.emit('end', taskName, deployedEntities)
    return deployedEntities
  }
}

module.exports = DeployActions
