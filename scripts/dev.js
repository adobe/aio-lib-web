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
/* eslint-disable no-template-curly-in-string */
const BaseScript = require('../lib/abstract-script')

const debug = require('debug')('aio-app-scripts:dev')

const path = require('path')
const fs = require('fs-extra')

const BuildActions = require('./build.actions')
const DeployActions = require('./deploy.actions')
const utils = require('../lib/utils')

// TODO: this jar should become part of the distro, OR it should be pulled from bintray or similar.
const OW_JAR_URL = 'https://github.com/adobe/aio-app-scripts/raw/binaries/bin/openwhisk-standalone-0.10.jar'

// This path will be relative to this module, and not the cwd, so multiple projects can use it.
const OW_JAR_FILE = path.resolve(__dirname, '../bin/openwhisk-standalone.jar')
// const OW_LOG_FILE = '.openwhisk-standalone.log'
const DOTENV_SAVE = '.env.app.save'
const WSK_DEBUG_PROPS = '.wskdebug.props.tmp'
const CODE_DEBUG_SAVE = '.vscode/launch.json.save'
const CODE_DEBUG = '.vscode/launch.json'

const OW_LOCAL_APIHOST = 'http://localhost:3233'
const OW_LOCAL_NAMESPACE = 'guest'
const OW_LOCAL_AUTH = '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'

class ActionServer extends BaseScript {
  async run (args = []) {
    const taskName = 'Local Dev Server'
    this.emit('start', taskName)

    // control variables
    const isLocal = !this.config.actions.devRemote
    const hasFrontend = this.config.app.hasFrontend

    // port for UI
    const port = args[0] || process.env.PORT || 9080

    // state
    const resources = {}
    let devConfig // config will be different if local or remote

    // bind cleanup function
    process.on('SIGINT', () => cleanup(null, resources))

    try {
      if (isLocal) {
        this.emit('progress', 'checking if docker is installed...')
        if (!await utils.hasDockerCLI()) throw new Error('could not find docker CLI, please make sure docker is installed')

        this.emit('progress', 'checking if docker is running...')
        if (!await utils.isDockerRunning()) throw new Error('docker is not running, please make sure to start docker')

        if (!fs.existsSync(OW_JAR_FILE)) {
          this.emit('progress', `downloading OpenWhisk standalone jar from ${OW_JAR_URL} to ${OW_JAR_FILE}, this might take a while... (to be done only once!)`)
          await utils.downloadOWJar(OW_JAR_URL, OW_JAR_FILE)
        }

        this.emit('progress', 'starting local OpenWhisk stack..')
        const res = await utils.runOpenWhiskJar(OW_JAR_FILE, OW_LOCAL_APIHOST, 60000, { stdio: 'inherit' })
        resources.owProc = res.proc

        this.emit('progress', `saving .env to ${DOTENV_SAVE} and writing new .env with local OpenWhisk guest credentials..`)
        utils.saveAndReplaceDotEnvCredentials(DOTENV_SAVE, OW_LOCAL_APIHOST, OW_LOCAL_NAMESPACE, OW_LOCAL_AUTH)
        resources.dotenv = '.env'
        resources.dotenvSave = DOTENV_SAVE
        devConfig = require('../lib/config-loader')() // reload config
      } else {
        // check credentials
        utils.checkOpenWhiskCredentials(this.config)
        this.emit('progress', 'using remote actions')
        devConfig = this.config
      }

      // build and deploy actions // todo support live reloading ?
      this.emit('progress', 'redeploying actions..')
      await (new BuildActions(devConfig)).run()
      await (new DeployActions(devConfig)).run()

      this.emit('progress', `writing credentials to tmp wskdebug config '${WSK_DEBUG_PROPS}'..`)
      // prepare wskprops for wskdebug
      fs.writeFileSync(WSK_DEBUG_PROPS, `NAMESPACE=${devConfig.ow.namespace}\nAUTH=${devConfig.ow.auth}\nAPIHOST=${devConfig.ow.apihost}`)
      resources.wskdebugProps = WSK_DEBUG_PROPS

      this.emit('progress', 'setting up vscode debug configuration files..')
      // todo refactor the whole .vscode/launch.json piece into utils
      // todo 2 don't enforce vscode config to non vscode dev
      fs.ensureDirSync(path.dirname(CODE_DEBUG))
      if (fs.existsSync(CODE_DEBUG)) {
        if (!fs.existsSync(CODE_DEBUG_SAVE)) {
          fs.moveSync(CODE_DEBUG, CODE_DEBUG_SAVE)
        }
      }
      fs.writeFileSync(CODE_DEBUG, JSON.stringify(await this.generateVSCodeDebugConfig(devConfig, hasFrontend, port), null, 2))
      resources.vscodeDebugConfig = CODE_DEBUG
      resources.vscodeDebugConfigSave = CODE_DEBUG_SAVE

      if (hasFrontend) {
        // inject backend urls into ui
        this.emit('progress', 'injecting backend urls into frontend config')
        const urls = await utils.generateActionUrls(devConfig, devConfig.manifest.package, isLocal)
        await utils.writeConfig(devConfig.web.injectedConfig, urls)

        this.emit('progress', 'starting local frontend server..')
        // todo: does it have to be index.html?
        const entryFile = path.join(devConfig.web.src, 'index.html')
        const app = utils.getUIDevExpressApp(entryFile, devConfig.web.distDev)
        resources.uiServer = app.listen(port)

        this.emit('progress', `local frontend server running at http://localhost:${port}`)
      }
      this.emit('progress', 'press CTRL+C to terminate dev environment')
      if (!resources.owProc && !resources.uiServer) {
        // not local + ow is not running => need to explicitely wait for CTRL+C
        // trick to avoid termination
        process.stdin.resume()
      }
    } catch (e) {
      cleanup(e, resources)
    }
  }

  // todo make util not instance function
  async generateVSCodeDebugConfig (devConfig, hasFrontend, uiPort) {
    const packageName = devConfig.ow.package
    const manifestActions = devConfig.manifest.package.actions // yaml.safeLoad(await fs.readFile(devConfig.manifest.dist, 'utf8')).packages[packageName].actions //

    const actionConfigNames = []
    const actionConfigs = Object.keys(manifestActions).map(an => {
      const name = `Action:${packageName}/${an}`
      actionConfigNames.push(name)
      const action = manifestActions[an]
      const actionPath = this._absApp(action.function)

      const config = {
        type: 'node',
        request: 'launch',
        name: name,
        // todo allow for global install aswell
        runtimeExecutable: this._absApp('./node_modules/.bin/wskdebug'),
        env: { WSK_CONFIG_FILE: this._absApp(WSK_DEBUG_PROPS) },
        timeout: 30000,
        // replaces remoteRoot with localRoot to get src files
        localRoot: this._absApp('.'),
        remoteRoot: '/code',
        outputCapture: 'std'
      }

      const actionFileStats = fs.lstatSync(actionPath)
      if (actionFileStats.isFile()) {
        // set wskdebug arg w/ path to src file
        config.runtimeArgs = [
          `${packageName}/${an}`,
          actionPath,
          '-v'
        ]
      } else if (actionFileStats.isDirectory()) {
        // set wskdebug arg w/ path to src file in function dir
        const zipMain = (fs.existsSync(path.join(actionPath, 'package.json')) && fs.readJsonSync(path.join(actionPath, 'package.json')).main) || 'index.js'
        config.runtimeArgs = [
          `${packageName}/${an}`,
          path.join(actionPath, zipMain),
          '-v'
        ]
      } else {
        throw new Error(`${actionPath} is not a valid file or directory`)
      }

      return config
    })
    const debugConfig = {
      configurations: actionConfigs,
      compounds: [{
        name: 'Actions',
        configurations: actionConfigNames
      }]
    }
    if (hasFrontend) {
      debugConfig.configurations.push({
        type: 'chrome',
        request: 'launch',
        name: 'Web',
        url: `http://localhost:${uiPort}`,
        webRoot: devConfig.web.src,
        sourceMapPathOverrides: {
          'webpack:///src/*': '${webRoot}/*'
        }
      })
      debugConfig.compounds.push({
        name: 'WebAndActions',
        configurations: ['Web'].concat(actionConfigNames)
      })
    }
    return debugConfig
  }
}

function cleanup (err, resources = {}) {
  if (resources.dotenv && resources.dotenvSave && fs.existsSync(resources.dotenvSave)) {
    console.error('resetting .env file...')
    fs.moveSync(resources.dotenvSave, resources.dotenv, { overwrite: true })
  }
  if (resources.owProc) {
    console.error('killing local OpenWhisk process...')
    resources.owProc.kill()
  }
  if (resources.wskdebugProps) {
    console.error('removing wskdebug tmp credentials file...')
    fs.removeSync(resources.wskdebugProps)
  }
  if (resources.vscodeDebugConfig && resources.vscodeDebugConfigSave && fs.existsSync(resources.vscodeDebugConfigSave)) {
    console.error('resetting .vscode/launch.json...')
    fs.moveSync(resources.vscodeDebugConfigSave, resources.vscodeDebugConfig, { overwrite: true })
  }
  if (resources.uiServer) {
    console.error('killing ui dev server...')
    resources.uiServer.close()
  }
  if (err) {
    debug('cleaning up because of dev error', err)
    throw err // exits with 1
  }
  process.exit(0) // todo don't exit just make sure we get out of waiting, unregister sigint and return properly (e.g. not waiting on stdin.resume anymore)
}

module.exports = ActionServer
