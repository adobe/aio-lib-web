/*
Copyright 2021 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const path = require('path')
const fs = require('fs-extra')
const superagent = require('superagent')
require('dotenv').config()

const bundle = require('../src/bundle')
const deployWeb = require('../src/deploy-web')
const undeployWeb = require('../src/undeploy-web')
const ENTRY_FILE = path.join(__dirname, 'sample-app/index.html')
const DEST_FOLDER = path.join(__dirname, 'dist/')
const CACHE_FILE = path.join(__dirname, '.cache')
const SRC_REGEX = /<script.*src="(?<src>.*?)"/

const config = {
  app: {
    hasFrontend: true,
    hostname: 'adobeio-static.net'
  },
  s3: {
    tvmUrl: 'https://firefly-tvm.adobe.io', // default tvm url
    credsCacheFile: CACHE_FILE,
    folder: process.env.AIO_runtime_namespace
  },
  ow: {
    namespace: process.env.AIO_runtime_namespace,
    auth: process.env.AIO_runtime_auth
  },
  web: {
    distProd: DEST_FOLDER
  }
}

async function cleanupTemp () {
  fs.removeSync(DEST_FOLDER)
  fs.unlinkSync(CACHE_FILE)
}

beforeAll(async () => {
  jest.setTimeout(240000)
  cleanupTemp()
})

/**
 * Test bundler
 */
describe('e2e', () => {
  let url

  test('check bundle output dir', async () => {
    let error
    let parcelBundle
    try {
      parcelBundle = await bundle(
        ENTRY_FILE,
        DEST_FOLDER,
        {}
      )
      await parcelBundle.bundler.bundle()
    } catch (e) {
      error = e
      console.error(e)
    }
    expect(error).toBeUndefined()
    expect(fs.existsSync(path.join(DEST_FOLDER, 'index.html'))).toBe(true)

    const html = fs.readFileSync(path.join(DEST_FOLDER, 'index.html'), 'utf8')
    const { src } = SRC_REGEX.exec(html).groups
    expect(src).not.toBeNull()
    expect(fs.existsSync(path.join(DEST_FOLDER, src))).toBe(true)
    expect(fs.existsSync(path.join(DEST_FOLDER, `${src}.map`))).toBe(true)
  })

  test('bundle and deploy test ui', async () => {
    let error, contents
    try {
      url = await deployWeb(config)
      const response = await superagent.get(url)
      contents = response.res.text
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
    expect(url).not.toBeNull()
    expect(contents).not.toBeNull()
    expect(contents).toEqual(fs.readFileSync(path.join(DEST_FOLDER, 'index.html'), 'utf8'))
  })

  test('undeploy', async () => {
    let error
    try {
      await undeployWeb(config)
      await superagent.get(url)
    } catch (e) {
      error = e
    }
    expect(error).not.toBeUndefined()
    expect(error.status).toEqual(404)
  })
})
