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

const fs = require('fs-extra') // promises
const path = require('path')
const execa = require('execa')
const archiver = require('archiver')
const debug = require('debug')('aio-app-scripts:utils')
const ioruntime = require('@adobe/aio-cli-plugin-runtime')
const fetch = require('node-fetch')
const dotenv = require('dotenv')

async function deployWsk (packageName, manifestPath, manifestContent, ow, logger, deployConfig) {
  let packages = manifestContent.packages
  let deleteEntities = true
  if(deployConfig) {
    //select entities to deploy as per deployConfig
    if(deployConfig.actions)
    {
      if(deployConfig.actions.toLowerCase() != 'all')
      {
        packages = {}
        Object.keys(manifestContent.packages).forEach((key) => {
          packages[key] = {}
          packages[key]['actions'] = {}
          Object.keys(manifestContent.packages[key]['actions']).forEach((actionName) => {
            if(actionName === deployConfig.actions) {
              deleteEntities = false
              packages[key]['actions'][actionName] = manifestContent.packages[key]['actions'][actionName]
            }
          })
        })
      }
    }
  }
  const entities = ioruntime.processPackage(packages, {}, {}, {})
  await ioruntime.syncProject(packageName, manifestPath, manifestContent, entities, ow, logger, deleteEntities)
}

async function undeployWsk (packageName, manifestContent, ow, logger) {
  // 1. make sure that the package exists
  let deployedPackage
  try {
    deployedPackage = await ow.packages.get(packageName)
  } catch (e) {
    if (e.statusCode === 404) throw new Error(`cannot undeploy actions for package ${packageName}, as it was not deployed.`)
    throw e
  }

  // 2. extract deployment entities from existing deployment, this extracts all ow resources that are annotated with the
  //    package name
  // note that entities.actions may contain actions outside deployedPackage
  const entities = await ioruntime.getProjectEntities(packageName, false, ow)

  // 3. make sure that we also clean all actions in the main package that are not part of a cna deployment (e.g. wskdebug actions)
  //    the goal is to prevent 409s on package delete (non empty package)
  const actionNames = new Set(entities.actions.map(a => a.name))
  deployedPackage.actions.forEach(a => {
    const deployedActionName = `${packageName}/${a.name}`
    if (!actionNames.has(deployedActionName)) {
      entities.actions.push({ name: deployedActionName })
    }
  })

  // 4. add apis to undeployment, apis are not part of the managed whisk project as they don't support annotations and
  //    hence can't be retrieved with getProjectEntities + api delete is idempotent so no risk of 404s
  entities.apis = ioruntime.processPackage(manifestContent.packages, {}, {}, {}, true).apis

  // 5. undeploy gathered entities
  await ioruntime.undeployPackage(entities, ow, logger)
}

async function installDeps (folder) {
  // todo do checks when exposing lib, for now those are redundant in our context
  // if (!(fs.lstatSync(folder).isDirectory() &&
  //      (fs.readdirSync(folder)).includes('package.json'))) {
  //   throw new Error(`${folder} is not a valid directory with a package.json file.`)
  // }
  // npm install
  await execa('npm', ['install', '--no-package-lock', '--only=prod'], { cwd: folder })
}

function getActionEntryFile (pacakgejson) {
  const pacakgejsonContent = fs.readJsonSync(pacakgejson)
  if (pacakgejsonContent.main) {
    return pacakgejsonContent.main
  }
  return 'index.js'
}

/**
 * Zip a file/folder using archiver
 * @param {String} filePath
 * @param {String} out
 * @param {boolean} pathInZip
 * @returns {Promise}
 */
function zip (filePath, out, pathInZip = false) {
  const stream = fs.createWriteStream(out)
  const archive = archiver('zip', { zlib: { level: 9 } })

  return new Promise((resolve, reject) => {
    stream.on('close', () => resolve())
    archive.pipe(stream)
    archive.on('error', err => reject(err))

    let stats
    try {
      stats = fs.lstatSync(filePath) // throws if enoent
    } catch (e) {
      archive.destroy()
      reject(e)
    }

    if (stats.isDirectory()) {
      archive.directory(filePath, pathInZip)
    } else if (stats.isFile()) {
      archive.file(filePath, { name: pathInZip || path.basename(filePath) })
    } else {
      archive.destroy()
      reject(new Error(`${filePath} is not a valid dir or file`)) // e.g. symlinks
    }

    archive.finalize()
  })
}

/**
 * Joins url path parts
 * @param {...string} args url parts
 * @returns {string}
 */
function urlJoin (...args) {
  let start = ''
  if (args[0] && args[0].startsWith('/')) start = '/'
  return start + args.map(a => a && a.replace(/(^\/|\/$)/g, ''))
    .filter(a => a) // remove empty strings / nulls
    .join('/')
}

/**
 * Writes an object to a file
 * @param {string} file path
 * @param {object} config object to write
 * @returns {Promise}
 */
function writeConfig (file, config) {
  fs.ensureDirSync(path.dirname(file))
  // for now only action URLs
  fs.writeFileSync(
    file,
    JSON.stringify(config), { encoding: 'utf-8' }
  )
}

async function isDockerRunning () {
  // todo more checks
  const args = ['info']
  try {
    await execa('docker', args)
    return true
  } catch (error) {
    debug('Error spawning docker info: ' + error)
  }
  return false
}

async function hasDockerCLI () {
  // todo check min version
  try {
    const result = await execa('docker', ['-v'])
    debug('docker version : ' + result.stdout)
    return true
  } catch (error) {
    debug('Error spawning docker info: ' + error)
  }
  return false
}

async function hasJavaCLI () {
  // todo check min version
  try {
    const result = await execa('java', ['-version'])
    debug('java version : ' + result.stdout)
    return true
  } catch (error) {
    debug('Error spawning java info: ' + error)
  }
  return false
}
// async function hasWskDebugInstalled () {
//   // todo should test for local install as well
//   try {
//     const result = await execa('wskdebug', ['--version'])
//     debug('wskdebug version : ' + result.stdout)
//     return true
//   } catch (error) {
//     debug('Error spawning wskdebug info: ' + error)
//   }
//   return false
// }

function getCustomConfig (config, key, defaultValue) {
  return typeof (config[key]) !== 'undefined' ? config[key] : defaultValue
}

async function downloadOWJar (url, outFile) {
  let response
  try {
    response = await fetch(url)
  } catch (e) {
    debug(`connection error while downloading '${url}'`, e)
    throw new Error(`connection error while downloading '${url}', are you online?`)
  }
  if (!response.ok) throw new Error(`unexpected response while downloading '${url}': ${response.statusText}`)
  fs.ensureDirSync(path.dirname(outFile))
  const fstream = fs.createWriteStream(outFile)

  return new Promise((resolve, reject) => {
    response.body.pipe(fstream)
    response.body.on('error', (err) => {
      reject(err)
    })
    fstream.on('finish', () => {
      resolve()
    })
  })
}

async function runOpenWhiskJar (jarFile, apihost, waitInitTime, waitPeriodTime, timeout, /* istanbul ignore next */ execaOptions = {}) {
  const proc = execa('java', ['-jar', '-Dwhisk.concurrency-limit.max=10', jarFile], execaOptions)
  await waitForOpenWhiskReadiness(apihost, waitInitTime, waitPeriodTime, timeout)
  // must wrap in an object as execa return value is awaitable
  return { proc }

  async function waitForOpenWhiskReadiness (host, initialWait, period, timeout) {
    const endTime = Date.now() + timeout
    await waitFor(initialWait)
    await _waitForOpenWhiskReadiness(host, endTime)

    async function _waitForOpenWhiskReadiness (host, endTime) {
      if (Date.now() > endTime) {
        throw new Error(`local openwhisk stack startup timed out: ${timeout}ms`)
      }
      let ok
      try {
        const response = await fetch(host + '/api/v1')
        ok = response.ok
      } catch (e) {
        ok = false
      }
      if (!ok) {
        await waitFor(period)
        return _waitForOpenWhiskReadiness(host, endTime)
      }
    }
    function waitFor (t) {
      return new Promise(resolve => setTimeout(resolve, t))
    }
  }
}

function saveAndReplaceDotEnvCredentials (dotenvFile, saveFile, apihost, namespace, auth) {
  if (fs.existsSync(saveFile)) throw new Error(`cannot save .env, please make sure to restore and delete ${saveFile}`) // todo make saveFile relative
  fs.moveSync(dotenvFile, saveFile)
  // Only override needed env vars and preserve other vars in .env
  const env = dotenv.parse(fs.readFileSync(saveFile))
  env.AIO_RUNTIME_APIHOST = apihost
  env.AIO_RUNTIME_AUTH = auth
  env.AIO_RUNTIME_NAMESPACE = namespace
  // existing AIO__ vars might override above AIO_ vars
  delete env.AIO__RUNTIME_AUTH
  delete env.AIO__RUNTIME_NAMESPACE
  delete env.AIO__RUNTIME_APIHOST
  const envContent = Object.keys(env).reduce((content, k) => content + `${k}=${env[k]}\n`, '')

  fs.writeFileSync(dotenvFile, envContent)
}

function checkOpenWhiskCredentials (config) {
  const owConfig = config.ow

  // todo errors are too specific to env context

  // this condition cannot happen because config defines it as empty object
  /* istanbul ignore next */
  if (typeof owConfig !== 'object') {
    throw new Error('missing aio runtime config, did you set AIO_RUNTIME_XXX env variables?')
  }
  // this condition cannot happen because config defines a default apihost for now
  /* istanbul ignore next */
  if (!owConfig.apihost) {
    throw new Error('missing Adobe I/O Runtime apihost, did you set the AIO_RUNTIME_APIHOST environment variable?')
  }
  if (!owConfig.namespace) {
    throw new Error('missing Adobe I/O Runtime namespace, did you set the AIO_RUNTIME_NAMESPACE environment variable?')
  }
  if (!owConfig.auth) {
    throw new Error('missing Adobe I/O Runtime auth, did you set the AIO_RUNTIME_AUTH environment variable?')
  }
}

function checkFile (filePath) {
  // note lstatSync will throw if file doesn't exist
  if (!fs.lstatSync(filePath).isFile()) throw Error(`${filePath} is not a valid file (e.g. cannot be a dir or a symlink)`)
}

function getActionUrls (config, /* istanbul ignore next */ isRemoteDev = false, /* istanbul ignore next */ isLocalDev = false) {
  // 6. set action urls
  // action urls {name: url}, if !LocalDev subdomain uses namespace
  return Object.entries({ ...config.manifest.package.actions, ...(config.manifest.package.sequences || {}) }).reduce((obj, [name, action]) => {
    const webArg = action['web-export'] || action.web
    const webUri = (webArg && webArg !== 'no' && webArg !== 'false') ? 'web' : ''
    if (isLocalDev) {
      // http://localhost:3233/api/v1/web/<ns>/<package>/<action>
      obj[name] = urlJoin(config.ow.apihost, 'api', config.ow.apiversion, webUri, config.ow.namespace, config.ow.package, name)
    } else if (isRemoteDev || !webUri) {
      // - if remote dev we don't care about same domain as the UI runs on localhost
      // - if action is non web it cannot be called from the UI and we can point directly to ApiHost domain
      // NOTE this will not work for apihosts that do not support <ns>.apihost url
      // https://<ns>.adobeioruntime.net/api/v1/web/<package>/<action>
      obj[name] = urlJoin('https://' + config.ow.namespace + '.' + removeProtocolFromURL(config.ow.apihost), 'api', config.ow.apiversion, webUri, config.ow.package, name)
    } else {
      // https://<ns>.adobe-static.net/api/v1/web/<package>/<action>
      obj[name] = urlJoin('https://' + config.ow.namespace + '.' + removeProtocolFromURL(config.app.hostname), 'api', config.ow.apiversion, webUri, config.ow.package, name)
    }
    return obj
  }, {})
}

function getUIUrl (config, bucket) {
  return `https://${config.ow.namespace}.${config.app.hostname}/${config.ow.package}/index.html`
  // in future if no hostname + custom s3 creds set we might want to return s3 url?
  // return `https://s3.amazonaws.com/${bucket}/${config.ow.namespace}/${config.ow.package}/index.html`
}

function removeProtocolFromURL (url) {
  return url.replace(/(^\w+:|^)\/\//, '')
}

module.exports = {
  hasJavaCLI,
  hasDockerCLI,
  isDockerRunning,
  zip,
  urlJoin,
  installDeps,
  writeConfig,
  //  hasWskDebugInstalled,
  deployWsk,
  undeployWsk,
  getCustomConfig,
  downloadOWJar,
  runOpenWhiskJar,
  saveAndReplaceDotEnvCredentials,
  checkOpenWhiskCredentials,
  checkFile,
  getActionUrls,
  getUIUrl,
  removeProtocolFromURL,
  getActionEntryFile
}
