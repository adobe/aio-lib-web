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
const debug = require('debug')('cna-scripts:utils')

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
  process.env['WSK_CONFIG_FILE'] = fakeWskProps

  try {
    // aio reads .aio runtime config
    await execa(`aio`, [
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
    let result = await execa('docker', args)
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
    let result = await execa('docker', ['-v'])
    debug('docker version : ' + result.stdout)
    return true
  } catch (error) {
    debug('Error spawning docker info: ' + error)
  }
  return false
}

async function hasWskDebugInstalled () {
  try {
    let result = await execa('wskdebug', ['--version'])
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
  hasWskDebugInstalled
}
