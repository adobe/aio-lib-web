/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const fs = require('fs-extra')
const path = require('path')
const Bundler = require('parcel-bundler')

const buildWeb = async (config, log) => {
  if (!config || !config.app || !config.app.hasFrontend) {
    throw new Error('cannot build web, app has no frontend or config is invalid')
  }

  const dist = config.web.distProd
  const src = config.web.src

  // clean/create needed dirs
  await fs.emptyDir(dist)

  // 2. build files
  const bundler = new Bundler(path.join(src, 'index.html'), {
    cache: false,
    outDir: dist,
    publicUrl: './',
    watch: false,
    logLevel: 0
  })

  await bundler.bundle()

  // 3. show built files ( if we are passed a log function )
  const files = await fs.readdir(dist)
  if (log) {
    files.forEach(f => log(`building ${f}`))
  }
  return files
}

module.exports = buildWeb
