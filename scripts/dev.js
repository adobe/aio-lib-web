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

const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-app-scripts:dev', { provider: 'debug' })

const path = require('path')
const fs = require('fs-extra')

const httpTerminator = require('http-terminator')
const BuildActions = require('./build.actions')
const DeployActions = require('./deploy.actions')
const utils = require('../lib/utils')
const { OW_JAR_FILE, OW_JAR_URL, OW_LOCAL_APIHOST, OW_LOCAL_NAMESPACE, OW_LOCAL_AUTH } = require('../lib/owlocal')
const execa = require('execa')
const Bundler = require('parcel-bundler')
const chokidar = require('chokidar')
let running = false
let changed = false
let watcher

const owWaitInitTime = 2000
const owWaitPeriodTime = 500
const owTimeout = 60000

class ActionServer extends BaseScript {
  async run (args = [], options = {}) {
    // options
    /* parcel bundle options */
    const bundleOptions = options.parcel || {}
    /* skip actions */
    const skipActions = !!options.skipActions

    const taskName = 'Local Dev Server'
    this.emit('start', taskName)

    // files
    // const OW_LOG_FILE = '.openwhisk-standalone.log'
    const DOTENV_SAVE = this._absApp('.env.app.save')
    const WSK_DEBUG_PROPS = this._absApp('.wskdebug.props.tmp')
    const CODE_DEBUG_SAVE = this._absApp('.vscode/launch.json.save')
    const CODE_DEBUG = this._absApp('.vscode/launch.json')

    // control variables
    const hasFrontend = this.config.app.hasFrontend
    const withBackend = this.config.app.hasBackend && !skipActions
    const isLocal = !this.config.actions.devRemote // applies only for backend

    // port for UI
    const uiPort = parseInt(args[0]) || parseInt(process.env.PORT) || 9080

    let frontEndUrl = null

    // state
    const resources = {}
    let devConfig = this.config // config will be different if local or remote

    // bind cleanup function
    process.on('SIGINT', async () => {
      // in case app-scripts are eventually turned into a lib:
      // - don't exit the process, just make sure we get out of waiting
      // - unregister sigint and return properly (e.g. not waiting on stdin.resume anymore)
      try {
        await cleanup(resources)
        aioLogger.info('exiting!')
        process.exit(0)
      } catch (e) {
        aioLogger.error('unexpected error while cleaning up!')
        aioLogger.error(e)
        process.exit(1)
      }
    })

    try {
      if (withBackend) {
        if (isLocal) {
          // take following steps only when we have a backend
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
          const res = await utils.runOpenWhiskJar(OW_JAR_FILE, OW_LOCAL_APIHOST, owWaitInitTime, owWaitPeriodTime, owTimeout, { stderr: 'inherit' })
          resources.owProc = res.proc

          // case1: no dotenv file => expose local credentials in .env, delete on cleanup
          const dotenvFile = this._absApp('.env')
          if (!fs.existsSync(dotenvFile)) {
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
        }

        // build and deploy actions
        this.emit('progress', 'redeploying actions..')
        await this._buildAndDeploy(devConfig, isLocal)

        watcher = chokidar.watch(devConfig.actions.src)
        watcher.on('change', this._getActionChangeHandler(devConfig, isLocal))

        this.emit('progress', `writing credentials to tmp wskdebug config '${this._relApp(WSK_DEBUG_PROPS)}'..`)
        // prepare wskprops for wskdebug
        fs.writeFileSync(WSK_DEBUG_PROPS, `NAMESPACE=${devConfig.ow.namespace}\nAUTH=${devConfig.ow.auth}\nAPIHOST=${devConfig.ow.apihost}`)
        resources.wskdebugProps = WSK_DEBUG_PROPS
      }

      if (hasFrontend) {
        let urls = {}
        if (this.config.app.hasBackend) {
          // inject backend urls into ui
          // note the condition: we still write backend urls EVEN if skipActions is set
          // the urls will always point to remotely deployed actions if skipActions is set
          this.emit('progress', 'injecting backend urls into frontend config')
          urls = await utils.getActionUrls(devConfig, true, isLocal && !skipActions)
        }
        await utils.writeConfig(devConfig.web.injectedConfig, urls)

        this.emit('progress', 'starting local frontend server ..')
        const entryFile = path.join(devConfig.web.src, 'index.html')

        // our defaults here can be overridden by the bundleOptions passed in
        // bundleOptions.https are also passed to bundler.serve
        const parcelBundleOptions = {
          cache: false,
          outDir: devConfig.web.distDev,
          contentHash: false,
          watch: true,
          minify: false,
          logLevel: 1,
          ...bundleOptions
        }
        let actualPort = uiPort
        resources.uiBundler = new Bundler(entryFile, parcelBundleOptions)
        resources.uiServer = await resources.uiBundler.serve(uiPort, bundleOptions.https)
        actualPort = resources.uiServer.address().port
        resources.uiServerTerminator = httpTerminator.createHttpTerminator({
          server: resources.uiServer
        })
        if (actualPort !== uiPort) {
          this.emit('progress', `Could not use port:${uiPort}, using port:${actualPort} instead`)
        }
        frontEndUrl = `${bundleOptions.https ? 'https:' : 'http:'}//localhost:${actualPort}`
        this.emit('progress', `local frontend server running at ${frontEndUrl}`)
      }

      this.emit('progress', 'setting up vscode debug configuration files..')
      fs.ensureDirSync(path.dirname(CODE_DEBUG))
      if (fs.existsSync(CODE_DEBUG)) {
        if (!fs.existsSync(CODE_DEBUG_SAVE)) {
          fs.moveSync(CODE_DEBUG, CODE_DEBUG_SAVE)
          resources.vscodeDebugConfigSave = CODE_DEBUG_SAVE
        }
      }
      fs.writeJSONSync(CODE_DEBUG,
        await this.generateVSCodeDebugConfig(devConfig, withBackend, hasFrontend, frontEndUrl, WSK_DEBUG_PROPS),
        { spaces: 2 })

      resources.vscodeDebugConfig = CODE_DEBUG

      if (!resources.owProc && !resources.uiServer) {
        // not local + ow is not running => need to explicitely wait for CTRL+C
        // trick to avoid termination
        resources.dummyProc = execa('node')
      }
      this.emit('progress', 'press CTRL+C to terminate dev environment')
    } catch (e) {
      aioLogger.error('unexpected error, cleaning up...')
      await cleanup(resources)
      throw e
    }
    return frontEndUrl
  }

  async generateVSCodeDebugConfig (devConfig, withBackend, hasFrontend, frontUrl, wskdebugProps) {
    const actionConfigNames = []
    let actionConfigs = []
    if (withBackend) {
      const packageName = devConfig.ow.package
      const manifestActions = devConfig.manifest.package.actions

      actionConfigs = Object.keys(manifestActions).map(an => {
        const name = `Action:${packageName}/${an}`
        actionConfigNames.push(name)
        const action = manifestActions[an]
        const actionPath = this._absApp(action.function)

        const config = {
          type: 'node',
          request: 'launch',
          name: name,
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
          // why is this condition here?
        }
        config.runtimeArgs = [
          `${packageName}/${an}`,
          actionPath,
          '-v'
        ]
        if (actionFileStats.isDirectory()) {
          // take package.json.main or 'index.js'
          const zipMain = utils.getActionEntryFile(path.join(actionPath, 'package.json'))
          config.runtimeArgs[1] = path.join(actionPath, zipMain)
        }
        if (action.annotations && action.annotations['require-adobe-auth']) {
          // NOTE: The require-adobe-auth annotation is a feature implemented in the
          // runtime plugin. The current implementation replaces the action by a sequence
          // and renames the action to __secured_<action>. The annotation will soon be
          // natively supported in Adobe I/O Runtime, at which point this condition won't
          // be needed anymore.
          /* instanbul ignore next */
          config.runtimeArgs[0] = `${packageName}/__secured_${an}`
        }
        return config
      })
    }
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
        url: frontUrl,
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

  _getActionChangeHandler (devConfig, isLocalDev) {
    return async (filePath) => {
      if (running) {
        aioLogger.debug(`${filePath} has changed. Deploy in progress. This change will be deployed after completion of current deployment.`)
        changed = true
        return
      }
      running = true
      try {
        aioLogger.debug(`${filePath} has changed. Redeploying actions.`)
        await this._buildAndDeploy(devConfig, isLocalDev)
        aioLogger.debug('Deployment successfull.')
      } catch (err) {
        this.emit('progress', '  -> Error encountered while deploying actions. Stopping auto refresh.')
        aioLogger.debug(err)
        await watcher.close()
      }
      if (changed) {
        aioLogger.debug('Code changed during deployment. Triggering deploy again.')
        changed = running = false
        await this._getActionChangeHandler(devConfig)(devConfig.actions.src)
      }
      running = false
    }
  }

  async _buildAndDeploy (devConfig, isLocalDev) {
    await (new BuildActions(devConfig)).run()
    const entities = await (new DeployActions(devConfig)).run([], { isLocalDev })
    if (entities.actions) {
      entities.actions.forEach(a => {
        this.emit('progress', `  -> ${a.url || a.name}`)
      })
    }
  }
}

async function cleanup (resources) {
  if (watcher) {
    aioLogger.info('stopping action watcher...')
    await watcher.close()
  }
  if (resources.uiBundler) {
    aioLogger.info('stopping parcel watcher...')
    await resources.uiBundler.stop()
  }
  if (resources.uiServer && resources.uiServerTerminator) {
    aioLogger.info('stopping ui server...')
    // close server and kill any open connections
    await resources.uiServerTerminator.terminate()
  }
  if (resources.dotenv && resources.dotenvSave && fs.existsSync(resources.dotenvSave)) {
    aioLogger.info('restoring .env file...')
    fs.moveSync(resources.dotenvSave, resources.dotenv, { overwrite: true })
  } else if (resources.dotenv && !resources.dotenvSave) {
    // if there was no save file it means .env was created
    aioLogger.info('deleting tmp .env file...')
    fs.removeSync(resources.dotenv)
  }
  if (resources.owProc) {
    aioLogger.info('stopping local OpenWhisk stack...')
    resources.owProc.kill()
  }
  if (resources.wskdebugProps) {
    aioLogger.info('removing wskdebug tmp credentials file...')
    fs.unlinkSync(resources.wskdebugProps)
  }
  if (resources.vscodeDebugConfig && !resources.vscodeDebugConfigSave) {
    aioLogger.info('removing .vscode/launch.json...')
    const vscodeDir = path.dirname(resources.vscodeDebugConfig)
    fs.unlinkSync(resources.vscodeDebugConfig)
    if (fs.readdirSync(vscodeDir).length === 0) {
      fs.rmdirSync(vscodeDir)
    }
  }
  if (resources.vscodeDebugConfigSave) {
    aioLogger.info('restoring previous .vscode/launch.json...')
    fs.moveSync(resources.vscodeDebugConfigSave, resources.vscodeDebugConfig, { overwrite: true })
  }
  if (resources.dummyProc) {
    aioLogger.info('stopping sigint waiter...')
    resources.dummyProc.kill()
  }
}

module.exports = ActionServer
