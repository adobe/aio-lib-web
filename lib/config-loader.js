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
const aioConfig = require('@adobe/aio-lib-core-config')

const debug = require('debug')('cna-scripts:config-loader')

/** loading config returns following object (this config is internal, not user facing):
{
  app: {
    name,
    version,
    hasFrontend
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

module.exports = () => {
  // init internal config
  const config = {}
  config.app = {}
  config.ow = {}
  config.s3 = {}
  config.web = {}
  config.manifest = {}
  config.actions = {}
  config.root = process.cwd()

  const _abs = (p) => path.join(config.root, p)
  // load aio config
  aioConfig.reload()
  const userConfig = aioConfig.get() || {}
  userConfig.cna = userConfig.cna || {}

  // 1. paths
  // 1.a defaults
  const actions = path.normalize(userConfig.cna.actions || 'actions')
  const dist = path.normalize(userConfig.cna.dist || 'dist')
  const web = path.normalize(userConfig.cna.web || 'web-src')
  // 1.b set config paths
  config.actions.src = _abs(actions) // todo this should be linked with manifest.yml paths
  config.actions.dist = _abs(path.join(dist, actions))

  config.web.src = _abs(web)
  config.web.distDev = _abs(path.join(dist, `${web}-dev`))
  config.web.distProd = _abs(path.join(dist, `${web}-prod`))
  config.web.injectedConfig = _abs(path.join(web, 'src', 'config.json'))

  config.s3.credsCacheFile = _abs('.aws.tmp.creds.json')
  config.manifest.src = _abs('manifest.yml')
  config.manifest.dist = _abs('.manifest-dist.yml')

  // set s3 creds if specified
  config.s3.creds = (typeof userConfig.cna === 'object') &&
    (userConfig.cna.awsaccesskeyid &&
     userConfig.cna.awssecretaccesskey &&
     userConfig.cna.s3bucket) && {
    accessKeyId: userConfig.cna.awsaccesskeyid,
    secretAccessKey: userConfig.cna.awssecretaccesskey,
    params: { Bucket: userConfig.cna.s3bucket }
  }

  // check if the app has a frontend, for now enforce index.html to be there
  // todo we shouldn't have any config.web config if !hasFrontend
  config.app.hasFrontend = fs.existsSync(path.join(config.web.src, 'index.html'))

  // 2. checks
  debug('running config checks')
  if (Object.keys(userConfig).length === 0) throw new Error('Missing aio config (set .aio file or AIO_XXX env vars)')
  // 2.a missing runtime config
  if (typeof userConfig.runtime !== 'object') throw new Error('Missing aio runtime config (set AIO_RUNTIME_XXX env vars)')
  if (!userConfig.runtime.apihost) throw new Error('Missing runtime.apihost .aio config (or AIO_RUNTIME_APIHOST env)')
  if (!userConfig.runtime.auth) throw new Error('Missing runtime.auth .aio config (or AIO_RUNTIME_AUTH env)')
  if (!userConfig.runtime.namespace) throw new Error('Missing runtime.namespace .aio config (or AIO_RUNTIME_NAMESPACE env')
  // 2.b missing tvm/s3 creds config if has frontend
  if (config.app.hasFrontend && !userConfig.cna.tvmurl && !config.s3.creds) throw new Error('Missing cna.tvmUrl .aio config (or AIO_CNA_TVMURL env) or aws credentials')
  // 2.c. needed files
  if (!fs.existsSync(config.manifest.src) || !fs.statSync(config.manifest.src).isFile()) throw new Error('Missing manifest.yml file')
  if (!fs.existsSync(_abs('package.json')) || !fs.statSync(_abs('package.json')).isFile()) throw new Error('Missing package.json file')

  // 3. load app config from package.json
  const packagejson = JSON.parse(fs.readFileSync(_abs('package.json')))
  config.app.version = packagejson.version || '0.0.1'
  config.app.name = packagejson.name || 'unnamed-cna'

  // 4. Load manifest config
  config.manifest.packagePlaceholder = '__CNA_PACKAGE__'
  config.manifest.full = yaml.safeLoad(fs.readFileSync(config.manifest.src, 'utf8'))
  config.manifest.package = config.manifest.full.packages[config.manifest.packagePlaceholder]

  // 5. deployment config
  config.ow = userConfig.runtime
  config.ow.apiversion = config.ow.apiversion || 'v1'
  config.ow.package = `${config.app.name}-${config.app.version}`
  config.s3.folder = utils.urlJoin(config.ow.package)
  config.s3.tvmUrl = userConfig.cna.tvmurl

  // 6. set action urls
  config.actions.remote = Boolean(process.env.REMOTE_ACTIONS)
  // action urls {name: url}, if dev url is /actions/name
  config.actions.urls = Object.entries({ ...config.manifest.package.actions, ...(config.manifest.package.sequences || {}) }).reduce((obj, [name, action]) => {
    const webArg = action['web-export'] || action.web
    const webUri = (webArg && webArg !== 'no' && webArg !== 'false') ? 'web' : ''
    obj[name] = utils.urlJoin(config.ow.apihost, 'api', config.ow.apiversion, webUri, config.ow.namespace, config.ow.package, name)
    return obj
  }, {})

  return config
}
