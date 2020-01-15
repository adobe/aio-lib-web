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
const webpack = require('webpack')

const debug = require('debug')('aio-app-scripts:build.actions')

// const Bundler = require('parcel-bundler')

class BuildActions extends BaseScript {
  async run (args = [], buildConfig = {}) {
    const taskName = 'Build actions'
    this.emit('start', taskName)

    fs.emptyDirSync(this.config.actions.dist)

    const build = async (name, action) => {
      const actionPath = this._absApp(action.function)
      const outPath = path.join(this.config.actions.dist, `${name}.zip`)
      const actionFileStats = fs.lstatSync(actionPath)

      if (!actionFileStats.isDirectory() && !actionFileStats.isFile()) throw new Error(`${action.function} is not a valid file or directory`)

      if (actionFileStats.isDirectory()) {
        // make sure package.json exists
        const packageJsonPath = path.join(actionPath, 'package.json')
        if (!fs.existsSync(packageJsonPath)) {
          throw new Error(`missing required ${this._relApp(packageJsonPath)} for folder actions`)
        }
        // make sure package.json exposes main or there is an index.js
        const expectedActionName = utils.getActionEntryFile(packageJsonPath)
        if (!fs.existsSync(path.join(actionPath, expectedActionName))) {
          throw new Error(`the directory ${action.function} must contain either a package.json with a 'main' flag or an index.js file at its root`)
        }
        // install dependencies
        await utils.installDeps(actionPath)
        // zip the action
        await utils.zip(actionPath, outPath)
      } else {
        const outBuildFilename = `${name}.tmp.js`
        const outBuildDir = path.dirname(outPath)
        // if not directory => package and minify to single file
        const compiler = webpack({
          entry: [
            actionPath
          ],
          output: {
            path: outBuildDir,
            filename: outBuildFilename,
            libraryTarget: 'commonjs2'
          },
          // see https://webpack.js.org/configuration/mode/
          mode: 'production',
          target: 'node',
          optimization: {
            // error on minification for some libraries
            minimize: false
          },
          // the following lines are used to require es6 module, e.g.node-fetch which is used by azure sdk
          resolve: {
            extensions: ['.js'],
            mainFields: ['main']
          }
          // todo remove packages from bundled file that are available in runtime (add the deps of deps as well)
          // disabled for now as we need to consider versions (at least majors) to avoid nasty bugs
          // ,externals: ['express', 'request', 'request-promise', 'body-parser', 'openwhisk']
        })

        await new Promise((resolve, reject) => compiler.run((err, stats) => {
          if (err) reject(err)
          // stats must be defined at this point
          const info = stats.toJson()
          if (stats.hasWarnings()) debug(`webpack compilation warnings:\n${info.warnings}`)
          if (stats.hasErrors()) reject(new Error(`action build failed, webpack compilation errors:\n${info.errors}`))
          return resolve(stats)
        }))

        // zip the bundled file
        // the path in zip must be renamed to index.js even if buildFilename is not index.js
        const zipSrcPath = path.join(outBuildDir, outBuildFilename)
        if (fs.existsSync(zipSrcPath)) {
          await utils.zip(zipSrcPath, outPath, 'index.js')
          fs.removeSync(zipSrcPath) // remove the build file
        } else {
          throw new Error(`could not find bundled output ${zipSrcPath}, building action '${name}' has likely failed`)
        }
      }
      return outPath
    }

    // which actions to build, check filter
    let actions = Object.entries(this.config.manifest.package.actions)
    if (Array.isArray(buildConfig.filterActions)) actions = actions.filter(([name, value]) => buildConfig.filterActions.includes(name))

    // build all sequentially (todo make bundler execution parallel)
    for (const [name, action] of actions) {
      const out = await build(name, action)
      this.emit('progress', `${this._relApp(out)}`)
    }
    this.emit('end', taskName)
  }
}

module.exports = BuildActions
