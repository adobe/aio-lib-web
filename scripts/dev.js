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
const CNAScript = require('../lib/abstract-script')

const path = require('path')

const express = require('express')
const execa = require('execa')

const Bundler = require('parcel-bundler')

const dotenv = require('dotenv')

const request = require('request-promise')
const fs = require('fs-extra')

const BuildActions = require('./build.actions')
const DeployActions = require('./deploy.actions')

const utils = require('../lib/utils')

const OW_JAR_URL = 'https://github.com/chetanmeh/incubator-openwhisk/releases/download/v0.10/openwhisk-standalone.jar'
const OW_JAR_FILE = 'openwhisk-standalone.jar'
const OW_LOG_FILE = '.openwhisk-standalone.logs'
const DOTENV_SAVE = '.env.cna.save'
const WSK_DEBUG_PROPS = '.wskdebug.props.tmp'
const CODE_DEBUG_SAVE = '.vscode/launch.json.save'
const CODE_DEBUG = '.vscode/launch.json'

class ActionServer extends CNAScript {
  async run (args) {
    const taskName = `Local Dev Server`
    this.emit('start', taskName)

    const port = args[0] || process.env.PORT || 9080

    // dev env is needed to generate local actions
    // process.env['NODE_ENV'] = process.env['NODE_ENV'] || 'development'
    let owStack
    let devConfig = this.config // if remote keep same config
    if (!this.config.actions.remote) {
      // 1. make sure we have the local binary
      if (!(await fs.exists(OW_JAR_FILE))) {
        this.emit('progress', `Could not find ${OW_JAR_FILE}, downloading it from ${OW_JAR_URL}, this might take a while ...`)
        const content = await request({ url: OW_JAR_URL, followAllRedirects: true, encoding: 'binary' })
        await fs.writeFile(OW_JAR_FILE, content, 'binary')
        this.emit('progress', `Successfully downloaded ${OW_JAR_FILE}`)
      }

      // 2. start the local ow stack
      this.emit('progress', `starting local OpenWhisk stack..`)
      owStack = execa('java', ['-jar', '-Dwhisk.concurrency-limit.max=10', OW_JAR_FILE])
      const logStream = fs.createWriteStream(OW_LOG_FILE) // todo formalize logs in config folder
      owStack.stdout.pipe(logStream) // todo not showing cleanup logs.. shuting down to early
      owStack.stderr.pipe(process.stderr) // todo error on stderr ?
      await waitFor(7000)

      // 3. change the .env
      if (!(await fs.exists(DOTENV_SAVE))) { await fs.move('.env', DOTENV_SAVE) }

      // Only override needed env vars and preserve other vars in .env
      const env = dotenv.parse(await fs.readFile(DOTENV_SAVE))
      // todo don't harcode port
      env['AIO_RUNTIME_APIHOST'] = 'http://localhost:3233'
      env['AIO_RUNTIME_AUTH'] = '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'
      env['AIO_RUNTIME_NAMESPACE'] = 'guest'
      delete env['AIO__RUNTIME_AUTH']
      delete env['AIO__RUNTIME_NAMESPACE']
      delete env['AIO__RUNTIME_APIHOST']
      const envContent = Object.keys(env).reduce((content, k) => content + `${k}=${env[k]}\n`, '')

      await fs.writeFile('.env', envContent)
      this.emit('progress', `saved .env to ${DOTENV_SAVE}`)
      this.emit('progress', 'set guest credentials in .env')

      // 4. build and deploy actions // todo support live reloading ? or just doc redeploy
      this.emit('progress', `redeploying actions to local environment..`)
      // 4.1 update config -- need to manually reload env vars
      // hack we need to manually reload env vars, as dotenv is not reloaded
      // see https://github.com/adobe/aio-cli-config/issues/2
      // todo generalize this and move to config
      // this would need to save env vars set outside of .env
      Object.keys(process.env).forEach(k => { if (k.startsWith('AIO')) delete process.env[k] })
      dotenv.config() // reload new dotenv
      devConfig = require('../lib/config-loader')()
      // 4.2 do build and deploy to local ow stack
      await (new BuildActions(devConfig)).run()
      await (new DeployActions(devConfig)).run()
    } else {
      // todo deploy
      // todo live redeploy?
      this.emit('progress', `using remote actions`)
    }

    // 5. inject backend urls into ui
    this.emit('progress', `injecting backend urls into frontend config`)
    await utils.writeConfig(devConfig.web.injectedConfig, devConfig.actions.urls)
    // 6. prepare UI dev server
    this.emit('progress', `setting up the static files bundler`)
    const app = express()
    app.use(express.json())
    const bundler = new Bundler(path.join(this.config.web.src, 'index.html'), {
      cache: false,
      outDir: this.config.web.distDev,
      contentHash: false,
      watch: true,
      minify: false,
      logLevel: 1
    })
    app.use(bundler.middleware())

    this.emit('progress', 'setting up debug configurations')
    // prepare wskprops for wskdebug
    await fs.writeFile(WSK_DEBUG_PROPS, `NAMESPACE=${devConfig.ow.namespace}\nAUTH=${devConfig.ow.auth}\nAPIHOST=${devConfig.ow.apihost}`)
    // generate needed vscode debug config
    // todo don't enforce vscode to non vscode devs
    await fs.ensureDir(path.dirname(CODE_DEBUG))
    if (await fs.exists(CODE_DEBUG)) {
      if (!(await fs.exists(CODE_DEBUG_SAVE))) await fs.move(CODE_DEBUG, CODE_DEBUG_SAVE)
    }
    await fs.writeFile(CODE_DEBUG, JSON.stringify(this.generateVSCodeDebugConfig(port), null, 2))

    // start server
    const server = app.listen(port)
    this.emit('progress', `local server running at http://localhost:${port}`)

    // cleanup on SIGINT
    const cleanup = err => {
      if (err) console.error(err)
      if (!this.config.actions.remote) {
        console.error('resetting .env')
        fs.removeSync('.env')
        fs.moveSync(DOTENV_SAVE, '.env')
        console.error('cleaning up OpenWhisk standalone stack')
        owStack.kill()
      }

      console.error('removing wskdebug props')
      fs.remove(WSK_DEBUG_PROPS)
      if (fs.existsSync(CODE_DEBUG_SAVE)) {
        console.error('resetting .vscode/launch.json')
        fs.removeSync(CODE_DEBUG)
        fs.moveSync(CODE_DEBUG_SAVE, CODE_DEBUG)
      }

      console.error('killing dev server')
      server.close()
      err ? process.exit(1) : process.exit(0)
    }
    // todo cleanup on kill, exit, unhandled error as well
    process.on('SIGINT', cleanup.bind(null))

    process.on('uncaughtException', cleanup.bind(null))
  }

  generateVSCodeDebugConfig (port) {
    const manifestActions = this.config.manifest.package.actions
    const packageName = this.config.ow.package

    const actionConfigNames = []
    const actionDebugConfig = Object.keys(manifestActions).map(an => {
      const name = `Action-${packageName}/${an}`
      actionConfigNames.push(name)
      const action = manifestActions[an]
      return {
        type: 'node',
        request: 'launch',
        name: name,
        runtimeExecutable: 'wskdebug',
        env: { WSK_CONFIG_FILE: '${workspaceFolder}/' + WSK_DEBUG_PROPS },
        args: [ `${packageName}/${an}`, '${workspaceFolder}/' + action.function, '-v' ], // todo add -l when live reload support, but needs one port per action
        localRoot: '${workspaceFolder}/' + path.dirname(action.function),
        remoteRoot: '/code',
        outputCapture: 'std'
      }
    })
    return {
      configurations: actionDebugConfig.concat({
        type: 'chrome',
        request: 'launch',
        name: 'Web',
        url: `http://localhost:${port}`,
        webRoot: '${workspaceFolder}/we-src/src',
        'sourceMapPathOverrides': {
          'webpack:///src/*': '${webRoot}/*'
        }
      }),
      compounds: [
        {
          name: 'WebAndActions',
          configurations: ['Web'].concat(actionConfigNames)
        },
        {
          name: 'Actions',
          configurations: actionConfigNames
        }
      ]
    }
  }
}

function waitFor (t) {
  return new Promise(resolve => setTimeout(resolve, t))
}

CNAScript.runOrExport(module, ActionServer)
