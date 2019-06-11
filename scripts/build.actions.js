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

const CNAScript = require('../lib/abstract-script')
const utils = require('../lib/utils')

const fs = require('fs-extra')
const path = require('path')
const Bundler = require('parcel-bundler')

class BuildActions extends CNAScript {
  async run () {
    const taskName = 'Build actions'
    this.emit('start', taskName)

    await fs.emptyDir(this.config.actions.dist)

    const build = async (name, action) => {
      const actionPath = this._absApp(action.function)
      if ((await fs.stat(actionPath)).isDirectory()) {
        // if directory install dependencies and zip it
        await utils.installDeps(actionPath)
        const outFile = path.join(this.config.actions.dist, `${name}.zip`)
        await utils.zipFolder(actionPath, outFile)
        return outFile
      } else {
        // if not directory => package and minify to single file
        const outFile = `${name}.js`
        const bundler = new Bundler(actionPath, {
          outDir: this.config.actions.dist,
          outFile: outFile,
          cache: false,
          watch: false,
          target: 'node',
          contentHash: false,
          minify: true,
          sourceMaps: false,
          bundleNodeModules: true,
          logLevel: 0 // 4
        })
        await bundler.bundle()
        return path.join(this.config.actions.dist, outFile)
      }
    }

    // build all sequentially
    for (let [name, action] of Object.entries(this.config.manifest.package.actions)) {
      const out = await build(name, action)
      this.emit('progress', `${this._relApp(out)}`)
    }
    this.emit('end', taskName)
  }
}

CNAScript.runOrExport(module, BuildActions)
