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
const utils = require('./utils')
const fs = require('fs-extra')
const joi = require('joi')

module.exports = class RemoteStorage {
  /**
   * @param  {object} creds
   * @param  {string} creds.accessKeyId
   * @param  {string} creds.secretAccessKey
   * @param  {string} creds.params.Bucket
   * @param  {string} [creds.sessionToken]
   */
  constructor (creds) {
    const res = joi.validate(creds, joi.object().keys({
      sessionToken: joi.string(),
      accessKeyId: joi.string().required(),
      secretAccessKey: joi.string().required(),
      // hacky needs s3Bucket in creds.params.Bucket
      params: joi.object().keys({ Bucket: joi.string().required() }).required()
    }).unknown())
    if (res.error) throw res.error
    this.s3 = new aws.S3(creds)
  }

  /**
   * Checks if prefix exists
   * @param  {string} prefix
   * @returns {boolean}
   */
  async folderExists (prefix) {
    if (typeof prefix !== 'string') throw new Error('missing prefix')
    const listParams = {
      Prefix: prefix
    }
    const listedObjects = await this.s3.listObjectsV2(listParams).promise()
    return listedObjects.Contents.length !== 0
  }

  /**
   * Deletes all files in a prefix location
   * @param  {string} prefix
   */
  async emptyFolder (prefix) {
    if (typeof prefix !== 'string') throw new Error('missing prefix')
    const listParams = {
      Prefix: prefix
    }
    const listedObjects = await this.s3.listObjectsV2(listParams).promise()
    if (listedObjects.Contents.length === 0) return
    const deleteParams = {
      Delete: { Objects: [] }
    }
    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key })
    })
    await this.s3.deleteObjects(deleteParams).promise()
    if (listedObjects.IsTruncated) await this.emptyFolder()
  }

  /**
   * Uploads a file
   * @param  {string} file
   * @param  {string} prefix - prefix to upload the file to
   */
  async uploadFile (file, prefix) {
    if (typeof prefix !== 'string') throw new Error('missing prefix')
    const content = await fs.readFile(file)
    const uploadParams = {
      Key: utils.urlJoin(prefix, path.basename(file)),
      Body: content,
      ACL: 'public-read',
      // s3 misses some mime types like for css files
      ContentType: mime.lookup(path.extname(file))
    }
    return this.s3.upload(uploadParams).promise()
  }

  /**
   * Uploads all files in a dir to - flat, no recursion support
   * @param  {string} dir - directory with files to upload
   * @param  {string} prefix - prefix to upload the dir to
   * @param  {function} [postFileUploadCallback] - called for each uploaded file
   */
  async uploadDir (dir, prefix, postFileUploadCallback) {
    if (typeof prefix !== 'string') throw new Error('missing prefix')
    async function _filterFiles (files) {
      const bools = await Promise.all(files.map(async f => (await fs.stat(f)).isFile()))
      return files.filter(f => bools.shift())
    }

    const files = await _filterFiles((await fs.readdir(dir)).map(f => path.join(dir, f)))

    // parallel upload
    return Promise.all(files.map(async f => {
      const s3Res = await this.uploadFile(f, prefix)
      if (postFileUploadCallback) postFileUploadCallback(f)
      return s3Res
    }))
  }
}
