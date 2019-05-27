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

/**
 * @param  {object} [options]
 * @param {string} [options.appDir] The path to the app, default to cwd
 * @param {object} [options.listeners]
 * @param {function} [options.listeners.onStart]
 * @param {function} [options.listeners.onEnd]
 * @param {function} [options.listeners.onProgress]
 * @param {function} [options.listeners.onResource]
 * @param {function} [options.listeners.onWarning]
 * @returns {object} With all script functions
 */
function exportScripts (options, listeners) {
  options = options || {}
  listeners = options.listeners || {}

  const appConfig = loadConfig(options.appDir)

  const instantiate = (scriptPath) => {
    const instance = new (require(scriptPath))(appConfig)

    if (listeners.onStart) instance.on('start', listeners.onStart)
    if (listeners.onEnd) instance.on('end', listeners.onEnd)
    if (listeners.onProgress) instance.on('progress', listeners.onProgress)
    if (listeners.onResource) instance.on('resource', listeners.onResource)
    if (listeners.onWarning) instance.on('warning', listeners.onWarning)

    return instance.run.bind(instance)
  }
  return {
    buildUI: instantiate('./scripts/build.ui'),
    buildActions: instantiate('./scripts/build.actions'),
    deployUI: instantiate('./scripts/deploy.ui'),
    deployActions: instantiate('./scripts/deploy.actions'),
    undeployUI: instantiate('./scripts/undeploy.ui'),
    undeployActions: instantiate('./scripts/undeploy.actions')
  }
}

module.exports = exportScripts
