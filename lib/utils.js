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

const runtimeHelpers = require('@adobe/aio-cli-plugin-runtime')

async function deployWskManifest (packageName, manifestPath, manifestContent, ow, logger) {
  // todo instead of packageName with version use only packagename w/o version?
  const entities = runtimeHelpers.processPackage(manifestContent.packages, {}, {}, {})
  await runtimeHelpers.syncProject(packageName, manifestPath, manifestContent, entities, ow, logger)
}

async function undeployWskManifest (packageName, manifestContent, ow, logger) {
  // 1. make sure that the package exists
  let deployedPackage
  try {
    deployedPackage = await ow.packages.get(packageName)
  } catch (e) {
    if (e.statusCode === 404) throw new Error(`cannot undeploy actions for package ${this.config.ow.package}, as it was not deployed.`)
    throw e
  }

  // 2. extract deployment entities from manifest file
  const entities = runtimeHelpers.processPackage(manifestContent.packages, {}, {}, {}, true) // true for only retrieving names

  // todo need to do same for dependency packages, trigger and rules, for apis no need as delete seems to be indempodent
  // 3. avoid 404 errors by excluding non-existing resources from manifest, this may happen if a previous undeploy was
  //    canceled or if a resource was added to the manifest w/o being deployed yet
  const deployedActionNames = new Set(deployedPackage.actions.map(a => a.name))
  entities.actions = entities.actions.filter(a => deployedActionNames.has(a.name))

  // 4. make sure that we clean all actions in the package that are not listed in the manifest (e.g. this happens when
  //    wskdebug adds some actions), the goal is to prevent 409 on package delete (non empty package)
  deployedPackage.actions.forEach(a => entities.actions.push({ name: `${packageName}/${a.name}` }))

  // 5. undeploy manifest resources
  await runtimeHelpers.undeployPackage(entities, ow, logger)
}

async function installDeps (folder) {
  if (!(fs.statSync(folder).isDirectory() &&
       (fs.readdirSync(folder)).includes('package.json'))) {
    throw new Error(`${folder} is not a valid directory with a package.json file.`)
  }
  // npm install
  await execa('npm', ['install', '--no-package-lock'], { cwd: folder })
}

async function spawnAioRuntimeDeploy (manifestFile, ...cmd) {
  // for now this is a tmp hack so that ~/.wskprops does not interfer AIO properties
  const fakeWskProps = path.resolve('.fake-wskprops')
  fs.writeFileSync(fakeWskProps, '')
  process.env.WSK_CONFIG_FILE = fakeWskProps

  try {
    // aio reads .aio runtime config
    await execa('aio', [
      'runtime',
      'deploy',
      ...cmd,
      '-m', manifestFile
    ]
    )
  } finally {
    // hack end remove fake props file
    fs.unlinkSync(fakeWskProps)
  }
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

module.exports = {
  hasDockerCLI,
  isDockerRunning,
  zipFolder,
  urlJoin,
  installDeps,
  spawnAioRuntimeDeploy,
  writeConfig,
  hasWskDebugInstalled,
  deployWskManifest,
  undeployWskManifest
}
