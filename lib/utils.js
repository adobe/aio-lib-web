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
  if (!(fs.statSync(folder).isDirectory() &&
       (fs.readdirSync(folder)).includes('package.json'))) {
    throw new Error(`${folder} is not a valid directory with a package.json file.`)
  }
  // npm install
  await execa('npm', ['install', '--no-package-lock'], { cwd: folder })
}

/**
 * Zip a folder using archiver
 * @param {String} dir
 * @param {String} out
 * @returns {Promise}
 */
function zipFolder (dir, out) {
  const stream = fs.createWriteStream(out)
  const archive = archiver('zip', { zlib: { level: 9 } })

  return new Promise((resolve, reject) => {
    stream.on('close', () => resolve())
    archive.pipe(stream)
    archive.on('error', err => reject(err))
    archive.directory(dir, false)
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
  const args = ['info', '--format', '"{{join .ServerErrors "null"}}"']
  try {
    const result = await execa('docker', args)
    // console.log('result.stdout = ' + result.stdout)
    // result.stdout is literal empty string when docker is running
    return result.stdout === '""'
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

async function hasWskDebugInstalled () {
  try {
    const result = await execa('wskdebug', ['--version'])
    debug('wskdebug version : ' + result.stdout)
    return true
  } catch (error) {
    debug('Error spawning docker info: ' + error)
  }
  return false
}

function getCustomConfig (config, key, defaultValue) {
  return typeof (config[key]) !== 'undefined' ? config[key] : defaultValue
}

module.exports = {
  hasDockerCLI,
  isDockerRunning,
  zipFolder,
  urlJoin,
  installDeps,
  writeConfig,
  hasWskDebugInstalled,
  deployWsk,
  undeployWsk,
  getCustomConfig
}
