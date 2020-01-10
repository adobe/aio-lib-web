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

const path = require('path')
const fs = require('fs')
const aioLogger = require('@adobe/aio-lib-core-logging')('aio-app-scripts:bin', { provider: 'debug' })

const args = process.argv.slice(2)

// don't silently ignore unhandled rejections
// In the future this won't be needed anymore as nodejs will terminate the
// process with a non zero exit code
process.on('unhandledRejection', e => {
  throw e
})

if (!args[0]) {
  throw new Error('Missing script name, usage aio-app-scripts <script-name> <script-args>')
}

const scriptDir = path.join(__dirname, '..', 'scripts')
const scriptName = args[0]

aioLogger.debug('Running script : ', scriptName)

switch (scriptName) {
  case 'add.auth' : // intentional fallthroughs
  case 'build.actions' :
  case 'build.ui' :
  case 'deploy.actions' :
  case 'deploy.ui' :
  case 'dev' :
  case 'undeploy.actions' :
  case 'undeploy.ui' : {
    try {
      const scriptPath = path.join(scriptDir, scriptName + '.js')
      // execa.sync(scriptPath, args.slice(1), { stdio: 'inherit' })

      const config = require('../lib/config-loader')()

      aioLogger.debug('loaded config')

      const ScriptClass = require(scriptPath)
      const script = new ScriptClass(config)
      script.on('start', taskName => console.error(`${taskName}...`))
      script.on('progress', item => console.error(`  > ${item}`))
      script.on('end', (taskName, res) => {
        console.error(`${taskName} done!`)
        if (res) {
          console.log(res)
        }
      }) // result on stdout stream
      script.on('warning', warning => console.error(warning))

      script.run(args.slice(1))
    } catch (e) {
      console.error(e.message)
      process.exit(1)
    }
    break
  }
  default : {
    console.error(`script '${scriptName}' is not supported, choose one of: ${fs.readdirSync(scriptDir).map(f => path.parse(f).name).join(', ')}`)
    break
  }
}
