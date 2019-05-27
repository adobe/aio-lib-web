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

const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs')
const utils = require('./utils')

/** loading config returns following object (this config is internal, not user facing):
{
  app: {
    name,
    version,
  },
  ow: {
    apihost,
    apiversion,
    auth,
    namespace,
    package
  },
  s3: {
    creds || tvmUrl,
    credsCacheFile,
    folder,
  },
  web: {
    src,
    injectedConfig,
    distDev,
    distProd,
  },
  manifest: {
    full,
    package,
    packagePlaceholder,
    src,
    dist,
  },
  actions: {
    src,
    dist,
    remote,
    urls
  }
}
*/

module.exports = appDir => {
  const config = {}

  // 1. paths
  appDir = appDir || process.cwd()
  appDir = path.resolve(appDir)
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) throw new Error(`${appDir} is not a valid CNA project path.`)
  const _abs = (p) => path.join(appDir, path.normalize(p))

  config.root = appDir
  config.actions = {
    src: _abs('actions'), // todo this should be removed as already defined in manifest.yaml
    dist: _abs('dist/actions')
  }
  config.web = {
    src: _abs('web-src'),
    distDev: _abs('dist/static-dev'),
    distProd: _abs('dist/static-prod'),
    injectedConfig: _abs('web-src/src/config.json') // todo this needs to be changed
  }
  config.s3 = { credsCacheFile: _abs('.aws.tmp.creds.json') }
  config.manifest = {
    src: _abs('manifest.yml'),
    dist: _abs('.manifest-dist.yml')
  }

  // 2 load .env
  require('dotenv').config({ path: _abs('.env') })
  /// ow
  /// all WHISK_* must be set in env
  config.ow = {}
  config.ow.apihost = process.env.WHISK_APIHOST
  config.ow.apiversion = process.env.WHISK_APIVERSION || 'v1'
  config.ow.auth = process.env.WHISK_AUTH
  config.ow.namespace = process.env.WHISK_NAMESPACE
  /// s3
  /// either tvmUrl
  config.s3.tvmUrl = process.env.TVM_URL
  /// or long term creds
  config.s3.creds = (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET) && {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    params: { Bucket: process.env.S3_BUCKET }
  }

  // 3. checks
  /// 3.1 missing user config
  if (!process.env.WHISK_APIHOST) throw new Error('Missing WHISK_APIHOST env variable')
  if (!process.env.WHISK_AUTH) throw new Error('Missing WHISK_AUTH env variable')
  if (!process.env.WHISK_NAMESPACE) throw new Error('Missing WHISK_NAMESPACE env variable')
  if (!(config.s3.tvmUrl || config.s3.creds)) throw new Error('Missing s3 credentials or TVM_URL env variable')
  /// 3.2 missing files
  if (!fs.existsSync(_abs('package.json'))) throw new Error('Missing package.json')
  if (!fs.existsSync(_abs('manifest.yml'))) throw new Error('Missing manifest.yml')

  // 4. load app config from package.json
  const packagejson = require(_abs('package.json'))
  config.app = {
    version: packagejson.version || '0.0.1',
    name: packagejson.name || 'unnamed-cna'
  }

  // 5. Load manifest config
  config.manifest.packagePlaceholder = '__CNA_PACKAGE__'
  config.manifest.full = yaml.safeLoad(fs.readFileSync(config.manifest.src, 'utf8'))
  config.manifest.package = config.manifest.full.packages[config.manifest.packagePlaceholder]

  // 6. deployment config
  config.ow.package = `${config.app.name}-${config.app.version}`
  config.s3.folder = utils.urlJoin(config.ow.namespace, config.ow.package)

  // 7. set action urls
  config.actions.remote = Boolean(process.env.REMOTE_ACTIONS)
  // action urls {name: url}, if dev url is /actions/name
  config.actions.urls = Object.entries(config.manifest.package.actions).reduce((obj, [name, action]) => {
    const webArg = action['web-export'] || action.web
    const webUri = (webArg && webArg !== 'no' && webArg !== 'false') ? 'web' : ''
    obj[name] = (!config.actions.remote && process.env.NODE_ENV === 'development')
      ? utils.urlJoin('/actions', name)
      : utils.urlJoin(config.ow.apihost, 'api', config.ow.apiversion, webUri, config.ow.namespace, config.ow.package, name)
    return obj
  }, {})

  return config
}
