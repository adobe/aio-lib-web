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
const express = require('express')
const Bundler = require('parcel-bundler')

async function deployWsk (packageName, manifestPath, manifestContent, ow, logger) {
  const entities = ioruntime.processPackage(manifestContent.packages, {}, {}, {})
  await ioruntime.syncProject(packageName, manifestPath, manifestContent, entities, ow, logger)
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

  // 2. extract deployment entities from previous deployment, this extracts all ow resources that are annotated with the
  //    package name
  const entities = await ioruntime.getProjectEntities(packageName, false, ow)

  // 3. make sure that we also clean all actions in the main package that are not part of a cna deployment (e.g. wskdebug actions)
  //    the goal is to prevent 409s on package delete (non empty package)
  // note that entities.actions may contain actions outside deployedPackage
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

  // 5. undeploy manifest resources
  await ioruntime.undeployPackage(entities, ow, logger)
}

async function installDeps (folder) {
  if (!(fs.lstatSync(folder).isDirectory() &&
       (fs.readdirSync(folder)).includes('package.json'))) {
    throw new Error(`${folder} is not a valid directory with a package.json file.`)
  }
  // npm install
  await execa('npm', ['install', '--no-package-lock', '--only=prod'], { cwd: folder })
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

    const stats = fs.lstatSync(filePath) // throws if enoent

    if (stats.isDirectory()) {
      archive.directory(filePath, pathInZip)
    } else if (stats.isFile()) {
      archive.file(filePath, { name: pathInZip || path.basename(filePath) })
    } else {
      // e.g. symlinks
      throw new Error(`${filePath} is not a valid dir or file`)
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
  try {
    const result = await execa('docker', ['-v'])
    debug('docker version : ' + result.stdout)
    return true
  } catch (error) {
    debug('Error spawning docker info: ' + error)
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
  const response = await fetch(url)
  if (!response.ok) throw new Error(`unexpected response while downloading '${url}': ${response.statusText}`)

  const fstream = fs.createWriteStream(outFile)
  await new Promise((resolve, reject) => {
    response.body.pipe(fstream)
    response.body.on('error', (err) => {
      reject(err)
    })
    fstream.on('finish', () => {
      resolve()
    })
  })
}

async function runOpenWhiskJar (jarFile, apihost, timeout, execaOptions = {}) {
  const proc = execa('java', ['-jar', '-Dwhisk.concurrency-limit.max=10', jarFile], execaOptions)
  await waitForOpenWhiskReadiness(apihost, 4000, 500, timeout)
  // must wrap in an object as execa return value is awaitable
  return { proc }

  async function waitForOpenWhiskReadiness (host, initialWait, period, timeout) {
    const endTime = new Date(Date.now() + timeout)
    await waitFor(initialWait)
    await _waitForOpenWhiskReadiness(host, endTime)

    async function _waitForOpenWhiskReadiness (host, endTime) {
      if (new Date().getTime() > endTime.getTime()) {
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

function saveAndReplaceDotEnvCredentials (saveFile, apihost, namespace, auth) {
  if (fs.existsSync(saveFile)) throw new Error(`cannot save .env, please make sure to restore and delete ${saveFile}`)
  fs.moveSync('.env', saveFile)

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
  fs.writeFileSync('.env', envContent)
}

function getUIDevExpressApp (entryFile, outDir) {
  if (!fs.existsSync(entryFile)) {
    throw new Error(`cannot start dev server, missing ${entryFile}`)
  }
  const bundler = new Bundler(entryFile, {
    cache: false,
    outDir,
    contentHash: false,
    watch: true,
    minify: false,
    logLevel: 1
  })
  const app = express()
  app.use(express.json())
  app.use(bundler.middleware())
  return app
}

function checkOpenWhiskCredentials (config) {
  const owConfig = config.ow

  // todo errors are too specific to env context

  // this condition cannot happen because config defines it as empty object
  /* istanbul ignore next */
  if (typeof owConfig !== 'object') {
    throw new Error('missing aio runtime config, did you set AIO_RUNTIME_XXX env variables?')
  }
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

function checkS3Credentials (config) {
  const s3Config = config.s3

  if (config.app.hasFrontend && !s3Config.tvmUrl && !s3Config.creds) {
    throw new Error('missing Adobe I/O TVM url or s3 credentials, did you set the `AIO_CNA_TVMURL` OR `[AIO_CNA_AWSACCESSKEYID, AIO_CNA_AWSSECRETACCESSKEY, AIO_CNA_S3BUCKET]` environment variables?')
  }
}

function checkFile (filePath) {
  // note lstatSync will throw if file doesn't exist
  if (!fs.lstatSync(filePath).isFile) throw Error(`${filePath} is not a valid file (e.g. cannot be a dir or a symlink)`)
}

function generateActionUrls (config, manifestPackageContent, isLocalDev = false) {
  // 6. set action urls
  // action urls {name: url}, if !LocalDev subdomain uses namespace
  return Object.entries({ ...manifestPackageContent.actions, ...(manifestPackageContent.sequences || {}) }).reduce((obj, [name, action]) => {
    const webArg = action['web-export'] || action.web
    const webUri = (webArg && webArg !== 'no' && webArg !== 'false') ? 'web' : ''
    if (isLocalDev) {
      // http://localhost:3233/api/v1/web/<ns>/<package>/<action>
      obj[name] = urlJoin(config.ow.apihost, 'api', config.ow.apiversion, webUri, config.ow.namespace, config.ow.package, name)
    } else {
      // https://<ns>.adobeioruntime.net/api/v1/web/<package>/<action>
      obj[name] = urlJoin('https://' + config.ow.namespace + '.' + removeProtocolFormURL(config.app.hostname), 'api', config.ow.apiversion, webUri, config.ow.package, name)
    }
    return obj
  }, {})
}

function removeProtocolFormURL (url = '') {
  return url.replace(/(^\w+:|^)\/\//, '')
}

module.exports = {
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
  getUIDevExpressApp,
  checkOpenWhiskCredentials,
  checkS3Credentials,
  checkFile,
  generateActionUrls,
  removeProtocolFormURL
}
