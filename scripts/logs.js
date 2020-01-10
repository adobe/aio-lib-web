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

const Openwhisk = require('Openwhisk')
const BaseScript = require('../lib/abstract-script')
const utils = require('../lib/utils')

class Logs extends BaseScript {
  // logsOptions cannot be passed from scripts
  async run (args = [], logsOptions = {}) {
    const taskName = 'Logs'
    this.emit('start', taskName)

    let limit = logsOptions.limit
    // remove this bit if app-scripts becomes a lib
    const i = args.indexOf('-l')
    if (i >= 0) {
      limit = args[i + 1]
    }
    limit = limit || 1

    const logger = logsOptions.logger || console.log

    // check for runtime credentials
    utils.checkOpenWhiskCredentials(this.config)

    const ow = Openwhisk({
      // todo make this.config.ow compatible with Openwhisk config
      apihost: this.config.ow.apihost,
      apiversion: this.config.ow.apiversion,
      api_key: this.config.ow.auth,
      namespace: this.config.ow.namespace
    })

    let hasLogs = false

    // get activations
    const listOptions = { limit: limit, skip: 0 }
    const activations = await ow.activations.list(listOptions)

    for (let i = 0; i < activations.length; ++i) {
      const activation = activations[i]
      const results = await ow.activations.logs({ activationId: activation.activationId })
      // send fetched logs to console
      if (results.logs && results.logs.length > 0) {
        hasLogs = true
        logger(activation.name + ':' + activation.activationId)
        results.logs.forEach(function (log) {
          logger(log)
        })
        logger()
      }
    }

    // if we move scripts to lib, return the log instead of logging them?
    this.emit('end', taskName, hasLogs)

    return hasLogs
  }
}
module.exports = Logs
