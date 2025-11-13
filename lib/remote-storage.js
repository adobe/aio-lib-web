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
const { codes, logAndThrow } = require('./StorageError')

const fileExtensionPattern = /\*\.[0-9a-zA-Z]+$/

// /**
//  * Joins url path parts
//  * @param {...string} args url parts
//  * @returns {string}
//  */
function urlJoin (...args) {
  let start = ''
  if (args[0] &&
      args[0].startsWith('/')) {
    start = '/'
  }
  return start + args.map(a => a && a.replace(/(^\/|\/$)/g, ''))
    .filter(a => a) // remove empty strings / nulls
    .join('/')
}

module.exports = class RemoteStorage {
  /**
   * @param  {object} creds
   * @param  {string} creds.accessKeyId
   * @param  {string} creds.secretAccessKey
   * @param  {string} creds.params.Bucket
   * @param  {string} [creds.sessionToken]
   */
  constructor (creds) {
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
   * Checks if prefix exists
   * @param  {string} prefix
   * @returns {boolean}
   */
  async folderExists (prefix) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    const listParams = {
      Bucket: this.bucket,
      Prefix: prefix
    }
    const listedObjects = await this.s3.listObjectsV2(listParams)

    return listedObjects.KeyCount > 0
  }

  /**
   * Deletes all files in a prefix location
   * @param  {string} prefix
   */
  async emptyFolder (prefix) {
    if (typeof prefix !== 'string') throw new Error('prefix must be a valid string')
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
      await this.emptyFolder(prefix)
    }
  }

  /**
   * Uploads a file
   * @param  {string} file
   * @param  {string} prefix - prefix to upload the file to
   * @param  {Object} appConfig - application config
   * @param  {string} distRoot - Distribution root dir
   */
  async uploadFile (file, prefix, appConfig, distRoot) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    const content = await fs.readFile(file)
    const mimeType = mime.lookup(path.extname(file))
    // first we will grab it from the global config: htmlCacheDuration, etc.
    const cacheControlString = this._getCacheControlConfig(mimeType, appConfig.app)
    const uploadParams = {
      Bucket: this.bucket,
      Key: urlJoin(prefix, path.basename(file)),
      Body: content
    }
    // if we found it in the global config, we will use it ( for now )
    if (cacheControlString) {
      uploadParams.CacheControl = cacheControlString
    }
    // add response headers if specified in manifest
    const responseHeaders = this.getResponseHeadersForFile(file, distRoot, appConfig)
    // here we allow overriding the cache control if specified in response headers
    // this is considered more specific than the general cache control config
    // ideally we deprecate cache control config in favor of response headers directly
    if (responseHeaders?.['adp-cache-control']) {
      uploadParams.CacheControl = responseHeaders['adp-cache-control']
      delete responseHeaders['adp-cache-control']
    }
    uploadParams.Metadata = responseHeaders ?? {}

    uploadParams.Metadata['adp-AuditUserId'] = appConfig.auditUserId
    // s3 misses some mime types like for css files
    if (mimeType) {
      uploadParams.ContentType = mimeType
    }
    // Note: putObject is recommended for files < 100MB and has a limit of 5GB, which is ok for our use case of storing static web assets
    // if we intend to store larger files, we should use multipart upload and https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_storage.html
    return this.s3.putObject(uploadParams)
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
   * Uploads all files in a dir to - recursion is supported
   * @param  {string} dir - directory with files to upload
   * @param  {string} prefix - prefix to upload the dir to
   * @param  {Object} appConfig - application config
   * @param  {function} [postFileUploadCallback] - called for each uploaded file
   */
  async uploadDir (dir, prefix, appConfig, postFileUploadCallback) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
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
      const res = await Promise.all(fileBatch.map(async f => {
        // get file's relative folder to the base directory.
        let prefixDirectory = path.dirname(path.relative(dir, f))
        // base directory returns ".", ignore that.
        prefixDirectory = prefixDirectory === '.' ? '' : prefixDirectory
        // newPrefix is now the initial prefix plus the files relative directory path.
        const newPrefix = urlJoin(prefix, prefixDirectory)
        const s3Res = await this.uploadFile(f, newPrefix, appConfig, dir)
        if (postFileUploadCallback) {
          postFileUploadCallback(f)
        }
        return s3Res
      }))
      allResults.push(res)
      fileBatch = files.splice(0, batchSize)
    }
    return allResults
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
    } else if (mimeType === mime.lookup('html')) {
      return `${cacheControlStr}, max-age=${appConfig.htmlCacheDuration}`
    } else if (mimeType === mime.lookup('js')) {
      return `${cacheControlStr}, max-age=${appConfig.jsCacheDuration}`
    } else if (mimeType === mime.lookup('css')) {
      return `${cacheControlStr}, max-age=${appConfig.cssCacheDuration}`
    } else if (mimeType.startsWith('image')) {
      return `${cacheControlStr}, max-age=${appConfig.imageCacheDuration}`
    } else {
      return null
    }
  }
}
