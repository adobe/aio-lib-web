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

const fs = require('fs-extra')
const path = require('path')
const Bundler = require('parcel-bundler')

const utils = require('../lib/utils')

class BuildUI extends BaseScript {
  async run () {
    const taskName = 'Build static files'
    this.emit('start', taskName)

    if (!this.config.app.hasFrontend) throw new Error('cannot build UI, app has no frontend')

    const dist = this.config.web.distProd
    const src = this.config.web.src

    // clean/create needed dirs
    await fs.emptyDir(dist)

    // 1. inject web config
    if (!this.config.ow.namespace || !this.config.ow.apihost) {
      // todo don't warn if UI only, don't inject?
      this.emit('warning', 'injected urls to backend actions are invalid because of missing Adobe I/O Runtime apihost and/or namespace')
    }

    const urls = await utils.getActionUrls(this.config, this.config.manifest.package, false)

    await utils.writeConfig(this.config.web.injectedConfig, urls)

    // 2. build UI files
    const bundler = new Bundler(path.join(src, 'index.html'), {
      cache: false,
      outDir: dist,
      publicUrl: './',
      watch: false,
      logLevel: 0
    })

    await bundler.bundle()

    // 3. show built files
    const files = await fs.readdir(dist)
    files.forEach(f => this.emit('progress', `${this._relApp(path.join(dist, f))}`))

    this.emit('end', taskName)
  }
}

module.exports = BuildUI
