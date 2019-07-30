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

const loadConfig = require('./lib/config-loader')

// load here - no lazy loading, as it breaks unit tests (mockfs require)
// Don't use lazy loading within scripts neither..
// todo fix this
const BuildUI = require('./scripts/build.ui')
const BuildActions = require('./scripts/build.actions')
const DeployUI = require('./scripts/deploy.ui')
const DeployActions = require('./scripts/deploy.actions')
const UndeployUI = require('./scripts/undeploy.ui')
const UndeployActions = require('./scripts/undeploy.actions')
const RunDev = require('./scripts/dev')
const AddAuth = require('./scripts/add.auth')

/**
 * @param  {object} [options]
 * @param {object} [options.listeners]
 * @param {function} [options.listeners.onStart]
 * @param {function} [options.listeners.onEnd]
 * @param {function} [options.listeners.onProgress]
 * @param {function} [options.listeners.onResource]
 * @param {function} [options.listeners.onWarning]
 * @returns {object} With all script functions
 */
function exportScripts (options) {
  options = options || {}
  const listeners = options.listeners || {}

  const appConfig = loadConfig()

  const instantiate = (ClassDesc) => {
    const instance = new ClassDesc(appConfig)

    if (listeners.onStart) instance.on('start', listeners.onStart)
    if (listeners.onEnd) instance.on('end', listeners.onEnd)
    if (listeners.onProgress) instance.on('progress', listeners.onProgress)
    if (listeners.onResource) instance.on('resource', listeners.onResource)
    if (listeners.onWarning) instance.on('warning', listeners.onWarning)

    return instance.run.bind(instance)
  }
  // interface
  return {
    buildUI: instantiate(BuildUI),
    buildActions: instantiate(BuildActions),
    deployUI: instantiate(DeployUI),
    deployActions: instantiate(DeployActions),
    undeployUI: instantiate(UndeployUI),
    undeployActions: instantiate(UndeployActions),
    runDev: instantiate(RunDev),
    addAuth: instantiate(AddAuth),
    // for unit testing
    _config: appConfig
  }
}

module.exports = exportScripts
