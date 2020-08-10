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

const rtUtils = require('@adobe/aio-lib-runtime').utils

const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-app-scripts:build.actions', { provider: 'debug' })

// const Bundler = require('parcel-bundler')

class BuildActions extends BaseScript {
  /**
   * runs the command
   *
   * @param {Array} [args=[]]
   * @param {object} [deployConfig={}]
   * @param {Array} [deployConfig.filterActions] only build actions specified by this array, e.g. ['name1', ..]
   * @returns
   * @memberof DeployActions
   */
  async run (args = [], buildConfig = {}) {
    if (!this.config.app.hasBackend) {
      throw new Error('cannot build actions, app has no backend')
    }
    const taskName = 'Build actions'
    this.emit('start', taskName)

    fs.emptyDirSync(this.config.actions.dist)

    const build = async (name, action) => {
      const actionPath = this._absApp(action.function)
      const outPath = path.join(this.config.actions.dist, `${name}.zip`)
      const tempBuildDir = path.join(path.dirname(outPath), `${name}-temp`) // build all to tempDir first
      const actionFileStats = fs.lstatSync(actionPath)

      // make sure temp/ exists
      fs.ensureDirSync(tempBuildDir)

      if (!actionFileStats.isDirectory() && !actionFileStats.isFile()) {
        throw new Error(`${action.function} is not a valid file or directory`)
      }

      // Process include(d) files
      const includeFiles = await utils.getIncludesForAction(action)
      includeFiles.forEach(incFile => {
        const dest = path.join(tempBuildDir, incFile.dest)
        fs.ensureDirSync(dest)
        // dest is expected to be a dir ...
        incFile.sources.forEach(file => {
          fs.copyFileSync(file, path.join(dest, path.parse(file).base))
        })
      })

      if (actionFileStats.isDirectory()) {
        // make sure package.json exists OR index.js
        const packageJsonPath = path.join(actionPath, 'package.json')
        if (!fs.existsSync(packageJsonPath)) {
          if (!fs.existsSync(path.join(actionPath, 'index.js'))) {
            throw new Error(`missing required ${this._relApp(packageJsonPath)} or index.js for folder actions`)
          }
          aioLogger.debug('action directory has an index.js, allowing zip')
        } else {
          // make sure package.json exposes main or there is an index.js
          const expectedActionName = rtUtils.getActionEntryFile(packageJsonPath)
          if (!fs.existsSync(path.join(actionPath, expectedActionName))) {
            throw new Error(`the directory ${action.function} must contain either a package.json with a 'main' flag or an index.js file at its root`)
          }
        }
        // TODO: when we get to excludes, use a filter function here.
        fs.copySync(actionPath, tempBuildDir, { dereference: true })
      } else {
        const outBuildFilename = 'index.js' // `${name}.tmp.js`
        // if not directory => package and minify to single file
        const compiler = webpack({
          entry: [
            actionPath
          ],
          output: {
            path: tempBuildDir,
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
            extensions: ['.js', '.json'],
            mainFields: ['main']
          }
          // todo remove packages from bundled file that are available in runtime (add the deps of deps as well)
          // disabled for now as we need to consider versions (at least majors) to avoid nasty bugs
          // ,externals: ['express', 'request', 'request-promise', 'body-parser', 'openwhisk']
        })

        // run the compiler and wait for a result
        await new Promise((resolve, reject) => compiler.run((err, stats) => {
          if (err) {
            reject(err)
          }
          // stats must be defined at this point
          const info = stats.toJson()
          if (stats.hasWarnings()) {
            aioLogger.debug(`webpack compilation warnings:\n${info.warnings}`)
          }
          if (stats.hasErrors()) {
            reject(new Error(`action build failed, webpack compilation errors:\n${info.errors}`))
          }
          return resolve(stats)
        }))
      }

      // zip the dir
      await utils.zip(tempBuildDir, outPath)
      // fs.remove(tempBuildDir) // remove the build file, don't need to wait ...

      // const fStats = fs.statSync(outPath)
      // if (fStats && fStats.size > (22 * 1024 * 1024)) {
      //   this.emit('warning', `file size exceeds 22 MB, you may not be able to deploy this action. file size is ${fStats.size} Bytes`)
      // }
      return outPath
    }

    // which actions to build, check filter
    if (!this.config.manifest.package) {
      const firstPkgName = Object.keys(this.config.manifest.full.packages)[0]
      this.config.manifest.package = this.config.manifest.full.packages[firstPkgName]
    }
    let actionsToBuild = Object.entries(this.config.manifest.package.actions)
    if (Array.isArray(buildConfig.filterActions)) {
      actionsToBuild = actionsToBuild.filter(([name, value]) => buildConfig.filterActions.includes(name))
    }

    // build all sequentially (todo make bundler execution parallel)
    for (const [name, action] of actionsToBuild) {
      const out = await build(name, action)
      this.emit('progress', `${this._relApp(out)}`)
    }
    this.emit('end', taskName)
  }
}

module.exports = BuildActions
