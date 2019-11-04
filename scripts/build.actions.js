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
      if ((fs.statSync(actionPath)).isDirectory()) {
        // if directory install dependencies and zip it
        await utils.installDeps(actionPath)
        const outFile = path.join(this.config.actions.dist, `${name}.zip`)
        await utils.zipFolder(actionPath, outFile)
        return outFile
      } else {
        // if not directory => package and minify to single file
        const outFile = `${name}.js`

        const compiler = webpack({
          entry: [
            actionPath
          ],
          output: {
            path: this.config.actions.dist,
            filename: outFile,
            library: name,
            libraryTarget: 'commonjs2'
          },
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
          },
          // sourcemaps are needed for debugging
          // todo don't source map on prod
          devtool: 'source-map'
        })
        await new Promise((resolve, reject) => compiler.run((err, stats) => {
          if (err) reject(err)
          return resolve(stats)
        }))
        return path.join(this.config.actions.dist, outFile)
      }
    }

    // build all sequentially
    for (const [name, action] of Object.entries(this.config.manifest.package.actions)) {
      const out = await build(name, action)
      this.emit('progress', `${this._relApp(out)}`)
    }
    this.emit('end', taskName)
  }
}

module.exports = BuildActions
