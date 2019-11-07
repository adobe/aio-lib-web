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
// const Bundler = require('parcel-bundler')

class BuildActions extends BaseScript {
  async run () {
    const taskName = 'Build actions'
    this.emit('start', taskName)

    fs.emptyDirSync(this.config.actions.dist)

    const build = async (name, action) => {
      const actionPath = this._absApp(action.function)
      const outFile = path.join(this.config.actions.dist, `${name}.zip`)
      const actionFileStats = fs.lstatSync(actionPath)

      if (!actionFileStats.isDirectory() && !actionFileStats.isFile()) throw new Error(`${action.function} is not a valid file or directory`)

      if (actionFileStats.isDirectory()) {
        // make sure package.json.main||index.js exists
        const expectedActionName = (fs.existsSync(path.join(actionPath, 'package.json')) && fs.readJsonSync(path.join(actionPath, 'package.json')).main) || 'index.js'
        if (expectedActionName && !fs.existsSync(path.join(actionPath, expectedActionName))) {
          throw new Error(`the directory ${action.function} must contain either a package.json with a 'main' flag or an index.js file at its root`)
        }
        // if directory install dependencies
        await utils.installDeps(actionPath)
        await utils.zip(actionPath, outFile)
      } else {
        const buildDir = path.join(this.config.actions.dist, `debug-${name}`)
        const buildFilename = path.basename(action.function)
        // if not directory => package and minify to single file
        const compiler = webpack({
          entry: [
            actionPath
          ],
          output: {
            path: buildDir,
            filename: buildFilename,
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

          // remove packages from bundled file that are available in runtime (on top of those add their dep as well)
          // disabled for now as we need to consider versions as well
          // ,externals: ['express', 'request', 'request-promise', 'body-parser', 'openwhisk']
        })
        await new Promise((resolve, reject) => compiler.run((err, stats) => {
          if (err) reject(err)
          return resolve(stats)
        }))

        // zip the bundled file (no source maps)
        // the path in zip must be renamed to index.js even if buildFilename is not index.js
        const zipSrcPath = path.join(buildDir, buildFilename)

        if (fs.existsSync(zipSrcPath)) {
          await utils.zip(zipSrcPath, outFile, 'index.js')
        } else {
          throw new Error(`the path ${zipSrcPath} does not exist. compile step must have failed.`)
        }
      }
      return outFile
    }

    // build all sequentially (todo make bundler execution parallel)
    for (const [name, action] of Object.entries(this.config.manifest.package.actions)) {
      const out = await build(name, action)
      this.emit('progress', `${this._relApp(out)}`)
    }
    this.emit('end', taskName)
  }
}

module.exports = BuildActions
