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

const Bundler = require('@parcel/core').default
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-lib-web:bundle', { provider: 'debug' })

/**
 * @typedef {object} BundleWebObject
 * @property {object} the Parcel bundler object
 * @property {Function} cleanup callback function to cleanup available resources
 */

/**
 * @typedef {object} BundleOptions
 * @property {boolean} cache
 * @property {boolean} contentHash
 * @property {boolean} watch
 * @property {boolean} minify
 * @property {number} logLevel
 */

/**
 * Bundles the web source via Parcel.
 *
 * @param {Array of string} [entries] one or more file paths or globs
 * @param {string} [dest] directory to build to
 * @param {BundleOptions} [options] the Parcel bundler options
 * @param {Function} [log] the app logger
 * @returns {BundleWebObject} the BundleWebObject
 */
module.exports = async (entries, dest, options = { shouldOptimize: false }, log = () => {}) => {
  aioLogger.debug(`bundle options: ${JSON.stringify(options, null, 2)}`)

  if (!entries) {
    throw new Error('cannot build web, entries not specified')
  }
  if (!dest) {
    throw new Error('cannot build web, missing destination')
  }

  // set defaults, but allow override by passed in values
  const parcelBundleOptions = {
    entries: entries,
    defaultConfig: require.resolve('@parcel/config-default'),
    shouldDisableCache: false,
    targets: {
      webassets: {
        includeNodeModules: true,
        distDir: dest
      }
    },
    defaultTargetOptions: {
      distDir: dest,
      shouldOptimize: options.shouldOptimize
    },
    shouldPatchConsole: false,
    shouldContentHash: true,
    logLevel: 'error',
    ...options
  }

  aioLogger.debug(`bundle bundleOptions: ${JSON.stringify(parcelBundleOptions, null, 2)}`)
  log(`bundling ${entries}`)
  const bundler = new Bundler(parcelBundleOptions)

  return bundler
}
