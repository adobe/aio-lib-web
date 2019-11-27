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
const execa = require('execa')

// TODO: this jar should become part of the distro, OR it should be pulled from bintray or similar.
const OW_JAR_URL = 'https://github.com/adobe/aio-app-scripts/raw/binaries/bin/openwhisk-standalone-0.10.jar'

// This path will be relative to this module, and not the cwd, so multiple projects can use it.
const OW_JAR_FILE = path.resolve(__dirname, '../bin/openwhisk-standalone.jar')

const OW_LOCAL_APIHOST = 'http://localhost:3233'
const OW_LOCAL_NAMESPACE = 'guest'
const OW_LOCAL_AUTH = '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'

const owWaitInitTime = 2000
const owWaitPeriodTime = 500
const owTimeout = 60000

class ActionServer extends BaseScript {
  async run (args = []) {
    const taskName = 'Local Dev Server'
    this.emit('start', taskName)

    // files
    // const OW_LOG_FILE = '.openwhisk-standalone.log'
    const DOTENV_SAVE = this._absApp('.env.app.save')
    const WSK_DEBUG_PROPS = this._absApp('.wskdebug.props.tmp')
    const CODE_DEBUG_SAVE = this._absApp('.vscode/launch.json.save')
    const CODE_DEBUG = this._absApp('.vscode/launch.json')

    // control variables
    const isLocal = !this.config.actions.devRemote
    const hasFrontend = this.config.app.hasFrontend

    // todo take port for ow server as well
    // port for UI
    const uiPort = args[0] || process.env.PORT || 9080

    // state
    const resources = {}
    let devConfig // config will be different if local or remote

    // bind cleanup function
    process.on('SIGINT', () => cleanup(null, resources))

    try {
      if (isLocal) {
        this.emit('progress', 'checking if java is installed...')
        if (!await utils.hasJavaCLI()) throw new Error('could not find java CLI, please make sure java is installed')

        this.emit('progress', 'checking if docker is installed...')
        if (!await utils.hasDockerCLI()) throw new Error('could not find docker CLI, please make sure docker is installed')

        this.emit('progress', 'checking if docker is running...')
        if (!await utils.isDockerRunning()) throw new Error('docker is not running, please make sure to start docker')

        if (!fs.existsSync(OW_JAR_FILE)) {
          this.emit('progress', `downloading OpenWhisk standalone jar from ${OW_JAR_URL} to ${OW_JAR_FILE}, this might take a while... (to be done only once!)`)
          await utils.downloadOWJar(OW_JAR_URL, OW_JAR_FILE)
        }

        this.emit('progress', 'starting local OpenWhisk stack..')
        const res = await utils.runOpenWhiskJar(OW_JAR_FILE, OW_LOCAL_APIHOST, owWaitInitTime, owWaitPeriodTime, owTimeout, { stdio: 'inherit' })
        resources.owProc = res.proc

        // case1: no dotenv file => expose local credentials in .env, delete on cleanup
        const dotenvFile = this._absApp('.env')
        if (!fs.existsSync(dotenvFile)) {
          // todo move to utils
          this.emit('progress', 'writing temporary .env with local OpenWhisk guest credentials..')
          fs.writeFileSync(dotenvFile, `AIO_RUNTIME_NAMESPACE=${OW_LOCAL_NAMESPACE}\nAIO_RUNTIME_AUTH=${OW_LOCAL_AUTH}\nAIO_RUNTIME_APIHOST=${OW_LOCAL_APIHOST}`)
          resources.dotenv = dotenvFile
        } else {
          // case2: existing dotenv file => save .env & expose local credentials in .env, restore on cleanup
          this.emit('progress', `saving .env to ${DOTENV_SAVE} and writing new .env with local OpenWhisk guest credentials..`)
          utils.saveAndReplaceDotEnvCredentials(dotenvFile, DOTENV_SAVE, OW_LOCAL_APIHOST, OW_LOCAL_NAMESPACE, OW_LOCAL_AUTH)
          resources.dotenvSave = DOTENV_SAVE
          resources.dotenv = dotenvFile
        }
        // delete potentially conflicting env vars
        delete process.env.AIO_RUNTIME_APIHOST
        delete process.env.AIO_RUNTIME_NAMESPACE
        delete process.env.AIO_RUNTIME_AUTH

        devConfig = require('../lib/config-loader')() // reload config for local config
      } else {
        // check credentials
        utils.checkOpenWhiskCredentials(this.config)
        this.emit('progress', 'using remote actions')
        devConfig = this.config
      }

      // build and deploy actions
      // todo support live reloading ?
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
          resources.vscodeDebugConfigSave = CODE_DEBUG_SAVE
        }
      }
      fs.writeFileSync(CODE_DEBUG, JSON.stringify(await this.generateVSCodeDebugConfig(devConfig, hasFrontend, uiPort, WSK_DEBUG_PROPS), null, 2))
      resources.vscodeDebugConfig = CODE_DEBUG

      if (hasFrontend) {
        // inject backend urls into ui
        this.emit('progress', 'injecting backend urls into frontend config')
        const urls = await utils.getActionUrls(devConfig.ow, devConfig.manifest.package, isLocal)
        await utils.writeConfig(devConfig.web.injectedConfig, urls)

        this.emit('progress', 'starting local frontend server..')
        // todo: does it have to be index.html?
        const entryFile = path.join(devConfig.web.src, 'index.html')
        const app = utils.getUIDevExpressApp(entryFile, devConfig.web.distDev)
        resources.uiServer = app.listen(uiPort)

        this.emit('progress', `local frontend server running at http://localhost:${uiPort}`)
      }
      if (!resources.owProc && !resources.uiServer) {
        // not local + ow is not running => need to explicitely wait for CTRL+C
        // trick to avoid termination
        resources.dummyProc = execa('node')
      }
      this.emit('progress', 'press CTRL+C to terminate dev environment')
    } catch (e) {
      cleanup(e, resources)
    }
  }

  // todo make util not instance function
  async generateVSCodeDebugConfig (devConfig, hasFrontend, uiPort, wskdebugProps) {
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
        env: { WSK_CONFIG_FILE: wskdebugProps },
        timeout: 30000,
        // replaces remoteRoot with localRoot to get src files
        localRoot: this._absApp('.'),
        remoteRoot: '/code',
        outputCapture: 'std'
      }

      const actionFileStats = fs.lstatSync(actionPath)
      if (actionFileStats.isFile()) {

      } if (actionFileStats.isDirectory()) {
        // take package.json.main or 'index.js'
        const zipMain = utils.getEntryFileName(path.join(actionPath, 'package.json'))
        config.runtimeArgs = [
          `${packageName}/${an}`,
          path.join(actionPath, zipMain),
          '-v'
        ]
      } else {
        // we assume its a file at this point
        // if symlink should have thrown an error during build stage, here we just ignore it
        config.runtimeArgs = [
          `${packageName}/${an}`,
          actionPath,
          '-v'
        ]
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
        breakOnLoad: true,
        sourceMapPathOverrides: {
          '*': path.join(devConfig.web.distDev, '*')
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

function cleanup (err, resources) {
  if (resources.dotenv && resources.dotenvSave && fs.existsSync(resources.dotenvSave)) {
    console.error('restoring .env file...')
    fs.moveSync(resources.dotenvSave, resources.dotenv, { overwrite: true })
  } else if (resources.dotenv && !resources.dotenvSave) {
    // if there was no save file it means .env was created
    console.error('deleting tmp .env file...')
    fs.removeSync(resources.dotenv)
  }
  if (resources.owProc) {
    console.error('killing local OpenWhisk process...')
    resources.owProc.kill()
  }
  if (resources.wskdebugProps) {
    console.error('removing wskdebug tmp credentials file...')
    fs.unlinkSync(resources.wskdebugProps)
  }
  if (resources.vscodeDebugConfig && !resources.vscodeDebugConfigSave) {
    console.error('removing .vscode/launch.json...')
    const vscodeDir = path.dirname(resources.vscodeDebugConfig)
    fs.unlinkSync(resources.vscodeDebugConfig)
    if (fs.readdirSync(vscodeDir).length === 0) {
      fs.rmdirSync(vscodeDir)
    }
  }
  if (resources.vscodeDebugConfigSave) {
    console.error('restoring previous .vscode/launch.json...')
    fs.moveSync(resources.vscodeDebugConfigSave, resources.vscodeDebugConfig, { overwrite: true })
  }
  if (resources.uiServer) {
    console.error('killing ui dev server...')
    resources.uiServer.close()
  }

  if (resources.dummyProc) {
    console.error('closing sigint waiter...')
    resources.dummyProc.kill()
  }
  if (err) {
    debug('cleaning up because of dev error', err)
    throw err // exits with 1
  }
  process.exit(0) // todo don't exit just make sure we get out of waiting, unregister sigint and return properly (e.g. not waiting on stdin.resume anymore)
}

module.exports = ActionServer
