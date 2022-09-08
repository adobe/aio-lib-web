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

const aws = require('aws-sdk')
const path = require('path')
const mime = require('mime-types')
const fs = require('fs-extra')
const joi = require('joi')
const klaw = require('klaw')

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
    if (res.error) throw res.error
    this.s3 = new aws.S3(creds)
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
      Prefix: prefix
    }
    const listedObjects = await this.s3.listObjectsV2(listParams).promise()
    return listedObjects.Contents.length > 0
  }

  /**
   * Deletes all files in a prefix location
   * @param  {string} prefix
   */
  async emptyFolder (prefix) {
    if (typeof prefix !== 'string') throw new Error('prefix must be a valid string')
    const listParams = {
      Prefix: prefix
    }
    const listedObjects = await this.s3.listObjectsV2(listParams).promise()
    if (listedObjects.Contents.length < 1) {
      return
    }
    const deleteParams = {
      Delete: { Objects: [] }
    }
    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key })
    })
    await this.s3.deleteObjects(deleteParams).promise()
    if (listedObjects.IsTruncated) {
      await this.emptyFolder(prefix)
    }
  }

  /**
   * Uploads a file
   * @param  {string} file
   * @param  {string} prefix - prefix to upload the file to
   * @param  {Object} appConfig - application config
   */
  async uploadFile (file, prefix, appConfig) {
    if (typeof prefix !== 'string') {
      throw new Error('prefix must be a valid string')
    }
    const content = await fs.readFile(file)
    const mimeType = mime.lookup(path.extname(file))
    const cacheControlString = this._getCacheControlConfig(mimeType, appConfig)
    const uploadParams = {
      Key: urlJoin(prefix, path.basename(file)),
      Body: content,
      CacheControl: cacheControlString
    }
    // s3 misses some mime types like for css files
    if (mimeType) {
      uploadParams.ContentType = mimeType
    }
    return this.s3.upload(uploadParams).promise()
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

    // parallel upload
    return Promise.all(files.map(async f => {
      // get file's relative folder to the base directory.
      let prefixDirectory = path.dirname(path.relative(dir, f))
      // base directory returns ".", ignore that.
      prefixDirectory = prefixDirectory === '.' ? '' : prefixDirectory
      // newPrefix is now the initial prefix plus the files relative directory path.
      const newPrefix = urlJoin(prefix, prefixDirectory)
      const s3Res = await this.uploadFile(f, newPrefix, appConfig)

      if (postFileUploadCallback) {
        postFileUploadCallback(f)
      }
      return s3Res
    }))
  }

  /**
    * Get cache control string based on mime type and config
    * @param {string|boolean} mimeType - string if valid mimeType or false for unknown files
    * @param  {Object} appConfig - application config
    */
  _getCacheControlConfig (mimeType, appConfig) {
    const cacheControlStr = 's-maxage=0'
    if (!mimeType) {
      return cacheControlStr
    } else if (mimeType === mime.lookup('html')) {
      return cacheControlStr + ', max-age=' + appConfig.htmlCacheDuration
    } else if (mimeType === mime.lookup('js')) {
      return cacheControlStr + ', max-age=' + appConfig.jsCacheDuration
    } else if (mimeType === mime.lookup('css')) {
      return cacheControlStr + ', max-age=' + appConfig.cssCacheDuration
    } else if (mimeType.startsWith('image')) {
      return cacheControlStr + ', max-age=' + appConfig.imageCacheDuration
    } else { return cacheControlStr }
  }
}
