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
const mime = require('mime-types')
const fs = require('fs-extra')
const klaw = require('klaw')
const http = require('http')
// const { NodeHttpHandler } = require('@smithy/node-http-handler')
// const { ProxyAgent } = require('proxy-agent')
const { codes, logAndThrow } = require('./StorageError')
const { getCliEnv, PROD_ENV } = require('@adobe/aio-lib-env')

// or https://deploy-service.dev.app-builder.adp.adobe.io
// or http://localhost:3000
const deploymentServiceUrl = getCliEnv() === PROD_ENV
  ? 'https://deploy-service.app-builder.adp.adobe.io'
  : 'https://deploy-service.stg.app-builder.corp.adp.adobe.io'

const fileExtensionPattern = /\*\.[0-9a-zA-Z]+$/

module.exports = class RemoteStorage {
/**
 * Constructor for RemoteStorage
 * @param {string} authToken - The authorization token to use for the remote storage
 */
  constructor (authToken) {
    this._authToken = authToken
  }

  /**
   * Checks if any files exist for the namespace
   * @param  {string} prefix - unused, kept for API compatibility
   * @param  {Object} appConfig - application config
   * @returns {Promise<boolean>} true if files exist, false otherwise
   */
  async folderExists (prefix, appConfig) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    if (!this._authToken) {
      throw new Error('cannot check if folder exists, Authorization is required')
    }
    // Call the list files endpoint (GET /files) - there is no GET /files/:key route
    const response = await fetch(`${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files`, {
      method: 'GET',
      headers: {
        Authorization: this._authToken
      }
    })
    if (!response.ok) {
      return false
    }
    const files = await response.json()
    // Check if there are any files (folder "exists" if it has content)
    return Array.isArray(files) && files.length > 0
  }

  /**
   * Empties all files for the namespace or deletes a specific file
   * @param {string} prefix - '/' to delete all files, or a specific file path
   * @param {Object} appConfig - application config
   * @returns {Promise<boolean>} true if the folder was emptied, false otherwise
   */
  async emptyFolder (prefix, appConfig) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    if (!this._authToken) {
      throw new Error('cannot empty folder, Authorization is required')
    }
    // Server route is DELETE /files/:key
    // When key='/' the server triggers emptyStorageForNamespace
    // URL construction: /files/ (trailing slash makes :key = '/')
    const url = prefix === '/'
      ? `${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files/`
      : `${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files/${prefix}`

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: this._authToken
      }
    })
    return response.ok
  }

  /**
   * Uploads a file to the CDN API
   * @param  {string} file - Full local file path
   * @param  {string} filePath - Path relative to namespace (e.g., 'images/photo.jpg' or 'index.html')
   *                             This becomes file.name in the API request. The server will prepend the namespace.
   * @param  {Object} appConfig - application config
   * @param  {string} distRoot - Distribution root dir (used for header matching)
   */
  async uploadFile (file, filePath, appConfig, distRoot) {
    if (typeof filePath !== 'string') {
      throw new Error('filePath must be a valid string')
    }

    const url = `${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files`

    const content = await fs.readFile(file)
    const mimeType = mime.lookup(path.extname(file))
    // first we will grab it from the global config: htmlCacheDuration, etc.
    let cacheControlString = this._getCacheControlConfig(mimeType, appConfig.app)

    // if we found it in the global config, we will use it ( for now )
    if (cacheControlString) {
      uploadParams.CacheControl = cacheControlString
    }
    // add response headers if specified in manifest
    const responseHeaders = this.getResponseHeadersForFile(file, distRoot, appConfig) ?? {}
    // here we allow overriding the cache control if specified in response headers
    // this is considered more specific than the general cache control config
    // ideally we deprecate cache control config in favor of response headers directly
    if (responseHeaders?.['adp-cache-control']) {
      cacheControlString = responseHeaders['adp-cache-control']
      delete responseHeaders['adp-cache-control']
    }
    // server expected body is: { contentType, cacheControl, customHeaders: {}, file: { name, content } }
    // file.name is the path relative to namespace (e.g., 'images/photo.jpg' or 'index.html')
    // The server will prepend the namespace to create the S3 key: ${namespace}/${file.name}
    const fileName = path.basename(file)
    let relativeFilePath = filePath.replace(appConfig.ow.namespace, '')
    if (relativeFilePath.startsWith('/')) {
      relativeFilePath = relativeFilePath.substring(1)
    }
    const filePathForServer = relativeFilePath === '' ? fileName : `${relativeFilePath}/${fileName}`
    const data = {
      file: {
        contentType: mimeType,
        cacheControl: cacheControlString,
        customHeaders: responseHeaders,
        name: filePathForServer,
        content: Buffer.from(content).toString('base64')
      }
    }
    const response = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._authToken
      }
    }).catch(error => {
      console.error('Error uploading file:', file)
      throw error
    })
    if (!response.ok) {
      console.error('Failed to upload file:', file)
      throw new Error(`Failed to upload file: ${response.statusText}`)
    }
    return response.status
  }

  getResponseHeadersForFile (file, distRoot, appConfig) {
    let responseHeaders
    if (appConfig.web && appConfig.web['response-headers']) {
      responseHeaders = {}
      const cdnConfig = appConfig.web['response-headers']
      const headerPrefix = 'adp-'

      Object.keys(cdnConfig).forEach(rule => {
        if (this.canAddHeader(file, distRoot, rule)) {
          Object.keys(cdnConfig[rule]).forEach(header => {
            this.validateHTTPHeader(header, cdnConfig[rule][header])
            responseHeaders[headerPrefix + header] = cdnConfig[rule][header]
          })
        }
      })
    }
    return responseHeaders
  }

  /**
   * Checks if a header can be added to a file based on the rule
   * @param {string} file - file path
   * @param {string} distRoot - distribution root
   * @param {string} rule - rule to check
   * @returns {boolean} true if header can be added, false otherwise
   */
  canAddHeader (file, distRoot, rule) {
    const filePath = path.parse(file)
    const normalisedRule = rule.replace(/\//g, path.sep)
    const ruleFolderPath = path.parse(normalisedRule)
    let folderPathToMatch = path.join(distRoot, ruleFolderPath.dir)
    if (folderPathToMatch.endsWith(path.sep)) {
      folderPathToMatch = folderPathToMatch.substring(0, folderPathToMatch.length - 1) // remove any trailing path separator
    }
    if (rule === '/*') { // all content
      return true
    } else if (rule.endsWith('/*')) { // all content in a folder ex. /test/*
      if (filePath.dir.startsWith(folderPathToMatch)) { // matches with the folder
        return true
      }
    } else if (fileExtensionPattern.test(rule)) { // all content with a given extension ex. /*.html or /test/*.js
      // check file has same extension as specified in header
      if ((filePath.ext === ruleFolderPath.ext) && (filePath.dir.startsWith(folderPathToMatch))) {
        return true
      }
    } else { // specific file match ex. /test/foo.js
      const uploadFilePath = path.join(distRoot, normalisedRule)
      if (file === uploadFilePath) {
        return true
      }
    }
    return false
  }

  validateHTTPHeader (headerName, value) {
    try {
      http.validateHeaderName(headerName)
    } catch (e) {
      logAndThrow(new codes.ERROR_INVALID_HEADER_NAME({ messageValues: [headerName], sdkDetails: {} }))
    }

    try {
      http.validateHeaderValue(headerName, value)
    } catch (e) {
      logAndThrow(new codes.ERROR_INVALID_HEADER_VALUE({ messageValues: [value, headerName], sdkDetails: {} }))
    }
  }

  async walkDir (dir) {
    return new Promise((resolve, reject) => {
      const items = []
      klaw(dir)
        .on('data', fd => {
          if (fd.stats.isFile()) {
            items.push(fd.path)
          }
        })
        .on('end', () => resolve(items))
    })
  }

  /**
   * Uploads all files in a directory recursively to the CDN API
   * @param  {string} dir - Local directory with files to upload
   * @param  {string} basePath - Base path prefix for all files (e.g., from config.s3.folder)
   *                              This is combined with each file's relative directory path.
   * @param  {Object} appConfig - application config
   * @param  {function} [postFileUploadCallback] - called for each uploaded file
   */
  async uploadDir (dir, basePath, appConfig, postFileUploadCallback) {
    if (typeof basePath !== 'string') {
      throw new Error('basePath must be a valid string')
    }

    // walk the whole directory recursively using klaw.
    const files = await this.walkDir(dir)

    // we will upload files in batches of 50 to prevent warnings about enqued tasks.
    // this happens based on the default maxSockets value of 50 in node.js but we cannot change
    // the user's default value.
    // less than 1% of users will see this warning, but it is better to prevent it.
    const batchSize = 50
    let fileBatch = files.splice(0, batchSize)
    const allResults = []
    if (!this._authToken) {
      throw new Error('cannot upload files, Authorization is required')
    }
    while (fileBatch.length > 0) {
      // sleep for 100ms to prevent rate limiting
      // await new Promise(resolve => setTimeout(resolve, 100))
      const res = await Promise.all(fileBatch.map(async file => {
        // Calculate the file's relative directory path from the base directory
        // e.g., if dir='/dist' and file='/dist/images/photo.jpg', relativeDir='images'
        let relativeDir = path.dirname(path.relative(dir, file))
        // path.relative returns '.' for files in the root directory, normalize to empty string
        relativeDir = relativeDir === '.' ? '' : relativeDir

        // Combine basePath with relativeDir to get the full file path relative to namespace
        // e.g., basePath='' + relativeDir='images' = 'images'
        //       basePath='assets' + relativeDir='images' = 'assets/images'
        const filePath = this._urlJoin(basePath, relativeDir)

        // Upload file with the calculated filePath (server will prepend namespace)
        const s3Result = await this.uploadFile(file, filePath, appConfig, dir)
        if (postFileUploadCallback) {
          postFileUploadCallback(file)
        }
        return s3Result
      }))
      allResults.push(res)
      fileBatch = files.splice(0, batchSize)
    }
    return allResults
  }

  /**
   * Joins file path parts into a URL-friendly S3 key
   * Normalizes paths by:
   * - Preserving leading slash if first part starts with '/'
   * - Removing leading/trailing slashes from each part
   * - Converting Windows backslashes to forward slashes
   * - Removing double slashes
   * - Filtering out empty/null parts
   * @param {...string} args - Path parts to join
   * @returns {string} Normalized S3 key path
   */
  _urlJoin (...args) {
    // Preserve leading slash if first argument starts with one
    const hasLeadingSlash = args[0] && args[0].startsWith('/')

    // Normalize each path part:
    // 1. Remove leading and trailing slashes (^\/ matches start, \/$ matches end)
    // 2. Convert Windows backslashes to forward slashes
    // 3. Filter out empty/null values
    const normalizedParts = args
      .map(part => {
        if (!part) return null
        // Remove leading/trailing slashes and convert backslashes to forward slashes
        return part.replace(/(^\/|\/$)/g, '').replace(/\\/g, '/')
      })
      .filter(part => part) // Remove empty strings and nulls

    // Join parts with '/' and remove any double slashes that may result
    const joined = normalizedParts.join('/')
    const withoutDoubleSlashes = joined.replace(/\/+/g, '/')

    // Restore leading slash if original first part had one
    return hasLeadingSlash ? '/' + withoutDoubleSlashes : withoutDoubleSlashes
  }

  /**
    * Get cache control string based on mime type and config
    * @param {string|boolean} mimeType - string if valid mimeType or false for unknown files
    * @param  {Object} appConfig - application config
    */
  _getCacheControlConfig (mimeType, appConfig) {
    const cacheControlStr = 's-maxage=60'
    if (!mimeType) {
      return null
    }
    if (mimeType === mime.lookup('html')) {
      if (appConfig.htmlCacheDuration) {
        return `${cacheControlStr}, max-age=${appConfig.htmlCacheDuration}`
      }
    }
    if (mimeType === mime.lookup('js')) {
      if (appConfig.jsCacheDuration) {
        return `${cacheControlStr}, max-age=${appConfig.jsCacheDuration}`
      }
    }
    if (mimeType === mime.lookup('css')) {
      if (appConfig.cssCacheDuration) {
        return `${cacheControlStr}, max-age=${appConfig.cssCacheDuration}`
      }
    }
    if (mimeType.startsWith('image')) {
      if (appConfig.imageCacheDuration) {
        return `${cacheControlStr}, max-age=${appConfig.imageCacheDuration}`
      }
    }
    return null
  }
}
