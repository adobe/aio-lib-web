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

const { S3 } = require('@aws-sdk/client-s3')
const path = require('path')
const mime = require('mime-types')
const fs = require('fs-extra')
const joi = require('joi')
const klaw = require('klaw')
const http = require('http')
// Proxy support for AWS SDK v3 (inspired by PR #224 by pat-lego, with compatibility fixes)
const { NodeHttpHandler } = require('@smithy/node-http-handler')
const { ProxyAgent } = require('proxy-agent')
const { EnvHttpProxyAgent } = require('undici')
const { codes, logAndThrow } = require('./StorageError')
const aioLibEnv = require('@adobe/aio-lib-env')

// Set AIO_DEPLOYMENT_SERVICE_URL env var to override the default deploy-service url
// dev deploy => https://deploy-service.dev.app-builder.adp.adobe.io
// run local =>  http://localhost:3000
const getDeploymentServiceUrl = () => {
  if (process.env.AIO_DEPLOYMENT_SERVICE_URL) {
    return process.env.AIO_DEPLOYMENT_SERVICE_URL
  }
  return aioLibEnv.getCliEnv() === aioLibEnv.PROD_ENV
    ? 'https://deploy-service.app-builder.adp.adobe.io'
    : 'https://deploy-service.stg.app-builder.corp.adp.adobe.io'
}

const fileExtensionPattern = /\*\.[0-9a-zA-Z]+$/

let fetchDispatcher
const getFetchDispatcher = () => {
  if (!fetchDispatcher) {
    fetchDispatcher = new EnvHttpProxyAgent()
  }
  return fetchDispatcher
}

const deployServiceFetch = (url, init) => {
  return fetch(url, { ...init, dispatcher: getFetchDispatcher() })
}

module.exports = class RemoteStorage {
  /**
   * Without creds the deploy-service CDN API is used.
   * With creds (BYO AWS S3) the S3 bucket is accessed directly.
   *
   * @param  {object} [creds]
   * @param  {string} creds.accessKeyId
   * @param  {string} creds.secretAccessKey
   * @param  {string} creds.params.Bucket
   * @param  {string} [creds.sessionToken]
   */
  constructor (creds) {
    if (creds === undefined || creds === null) {
      // deploy-service mode
      return
    }
    const res = joi.object().keys({
      sessionToken: joi.string(),
      accessKeyId: joi.string().required(),
      secretAccessKey: joi.string().required(),
      // hacky needs s3Bucket in creds.params.Bucket
      params: joi.object().keys({ Bucket: joi.string().required() }).required()
    }).unknown()
      .validate(creds)
    if (res.error) {
      throw res.error
    }

    // the TVM response could be passed as is to the v2 client constructor, but the v3 client follows a different format
    // see https://github.com/adobe/aio-tvm/issues/85
    const region = creds.region || 'us-east-1'
    // note this must supports TVM + BYO use cases
    // see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/credentials.html
    const credentials = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration ? new Date(creds.expiration) : undefined
    }
    this.bucket = creds.params.Bucket

    // Configure proxy support for AWS SDK v3
    // ProxyAgent automatically handles proxy environment variables via proxy-from-env
    const agent = new ProxyAgent()
    const s3Config = {
      credentials,
      region,
      requestHandler: new NodeHttpHandler({
        httpAgent: agent,
        httpsAgent: agent
      })
    }

    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/s3.html#constructor
    this.s3 = new S3(s3Config)
  }

  /**
   * Checks if any files exist for the namespace
   * @param  {string} authToken - Authorization header value (unused for BYO S3)
   * @param  {string} prefix - unused for deploy-service, S3 prefix for BYO S3
   * @param  {Object} appConfig - application config
   * @returns {Promise<boolean>} true if files exist, false otherwise
   */
  async folderExists (authToken, prefix, appConfig) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    if (this.s3) {
      const listParams = {
        Bucket: this.bucket,
        Prefix: prefix
      }
      const listedObjects = await this.s3.listObjectsV2(listParams)

      return listedObjects.KeyCount > 0
    }
    // Call the list files endpoint (GET /files) - there is no GET /files/:key route
    const response = await deployServiceFetch(`${getDeploymentServiceUrl()}/cdn-api/namespaces/${appConfig.ow.namespace}/files`, {
      method: 'GET',
      headers: {
        Authorization: authToken
      }
    })
    if (!response.ok) {
      throw new Error(`cannot check if folder exists, request failed: ${response.status} ${response.statusText}`)
    }
    const files = await response.json()
    // Check if there are any files (folder "exists" if it has content)
    return Array.isArray(files) && files.length > 0
  }

  /**
   * Empties all files for the namespace or deletes a specific file
   * @param {string} authToken - Authorization header value
   * @param {string} prefix - '/' to delete all files, or a specific file path
   * @param {Object} appConfig - application config
   * @returns {Promise<boolean>} true if the folder was emptied, false otherwise
   */
  async emptyFolder (authToken, prefix, appConfig) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    if (this.s3) {
      const listParams = {
        Bucket: this.bucket,
        Prefix: prefix
      }
      const listedObjects = await this.s3.listObjectsV2(listParams)

      if (listedObjects.KeyCount < 1) {
        return
      }
      const deleteParams = {
        Bucket: this.bucket,
        Delete: { Objects: [] }
      }
      listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key })
      })
      await this.s3.deleteObjects(deleteParams)
      if (listedObjects.IsTruncated) {
        await this.emptyFolder(authToken, prefix, appConfig)
      }
      return
    }
    // Server route is DELETE /files/:key
    // When key='/' the server triggers emptyStorageForNamespace
    // URL construction: /files/ (trailing slash makes :key = '/')
    const deploymentServiceUrl = getDeploymentServiceUrl()
    const url = prefix === '/'
      ? `${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files/`
      : `${deploymentServiceUrl}/cdn-api/namespaces/${appConfig.ow.namespace}/files/${prefix}`

    const response = await deployServiceFetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: authToken
      }
    })
    return response.ok
  }

  /**
   * Uploads a file to the CDN API
   * @param  {string} authToken - Authorization header value
   * @param  {string} file - Full local file path
   * @param  {string} filePath - Path relative to namespace (e.g., 'images/photo.jpg' or 'index.html')
   *                             This becomes file.name in the API request. The server will prepend the namespace.
   * @param  {Object} appConfig - application config
   * @param  {string} distRoot - Distribution root dir (used for header matching)
   */
  async uploadFile (authToken, file, filePath, appConfig, distRoot) {
    if (typeof filePath !== 'string') {
      throw new Error('filePath must be a valid string')
    }
    if (this.s3) {
      // BYO S3: filePath is the S3 prefix to upload the file to
      const prefix = filePath
      const content = await fs.readFile(file)
      const mimeType = mime.lookup(path.extname(file))
      // first we will grab it from the global config: htmlCacheDuration, etc.
      const cacheControlString = this._getCacheControlConfig(mimeType, appConfig.app)
      const uploadParams = {
        Bucket: this.bucket,
        Key: this._urlJoin(prefix, path.basename(file)),
        Body: content
      }
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
        uploadParams.CacheControl = responseHeaders['adp-cache-control']
        delete responseHeaders['adp-cache-control']
      }

      // we only set metadata if we have added anything to responseHeaders object
      // it is not null, but could be empty
      if (Object.keys(responseHeaders).length > 0) {
        uploadParams.Metadata = responseHeaders
      }
      // s3 misses some mime types like for css files
      if (mimeType) {
        uploadParams.ContentType = mimeType
      }
      // Note: putObject is recommended for files < 100MB and has a limit of 5GB, which is ok for our use case of storing static web assets
      // if we intend to store larger files, we should use multipart upload and https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_storage.html
      return this.s3.putObject(uploadParams)
    }
    const url = `${getDeploymentServiceUrl()}/cdn-api/namespaces/${appConfig.ow.namespace}/files`

    const content = await fs.readFile(file)
    const mimeType = mime.lookup(path.extname(file))
    // first we will grab it from the global config: htmlCacheDuration, etc.
    let cacheControlString = this._getCacheControlConfig(mimeType, appConfig.app)
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
    let relativeFilePath = filePath
    if (relativeFilePath.startsWith('/')) {
      relativeFilePath = relativeFilePath.substring(1)
    }
    // Use _urlJoin to normalize backslashes and construct the file path
    const filePathForServer = this._urlJoin(relativeFilePath, fileName)
    // NOTE: File content is base64-encoded in the JSON body
    // which increases payload size by ~33%. Look at getting server to handle
    // multipart uploads to avoid this.
    const data = {
      file: {
        contentType: mimeType,
        cacheControl: cacheControlString,
        customHeaders: responseHeaders,
        name: filePathForServer,
        content: Buffer.from(content).toString('base64')
      }
    }
    const response = await deployServiceFetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken
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
   * @param  {string} authToken - Authorization header value
   * @param  {string} dir - Local directory with files to upload
   * @param  {string} basePath - Base path prefix for all files (e.g., from config.s3.folder)
   *                              This is combined with each file's relative directory path.
   * @param  {Object} appConfig - application config
   * @param  {function} [postFileUploadCallback] - called for each uploaded file
   */
  async uploadDir (authToken, dir, basePath, appConfig, postFileUploadCallback) {
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
    while (fileBatch.length > 0) {
      // this used to sleep, but I don't think we need it here.
      // I am leaving it here in case we see issues with rate limiting.
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
        const s3Result = await this.uploadFile(authToken, file, filePath, appConfig, dir)
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
