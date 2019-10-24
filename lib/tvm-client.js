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

const joi = require('@hapi/joi')
const fs = require('fs-extra')
const request = require('request-promise')

module.exports = class TVMClient {
  /**
   * @param  {object} params
   * @param  {string} params.tvmUrl
   * @param  {string} params.owAuth
   * @param  {string} params.owNamespace
   * @param  {string} [params.cacheCredsFile] if omitted no caching (not recommended)
   */
  constructor (params) {
    const res = joi.object().keys({
      owNamespace: joi.string().required(),
      owAuth: joi.string().required(),
      tvmUrl: joi.string().uri().required(),
      cacheCredsFile: joi.string()
    }).unknown()
      .validate(params)

    if (res.error) throw res.error

    this.owAuth = params.owAuth
    this.owNamespace = params.owNamespace
    this.tvmUrl = params.tvmUrl
    if (params.cacheCredsFile) {
      this.cacheCredsFile = params.cacheCredsFile
      this.cacheKey = `${params.owNamespace}-${params.tvmUrl}`
    }
  }

  async _getCredentialsFromTVM () {
    return request(this.tvmUrl, {
      json: {
        owNamespace: this.owNamespace,
        owAuth: this.owAuth
      }
    })
  }

  async _cacheCredentialsToFile (creds) {
    if (!this.cacheCredsFile) return null

    let allCreds
    try {
      const content = (await fs.readFile(this.cacheCredsFile)).toString()
      allCreds = JSON.parse(content)
    } catch (e) {
      allCreds = {} // cache file does not exist or is invalid
    }

    // need to store by namespace in case user changes namespace in config
    allCreds[this.cacheKey] = creds
    await fs.writeFile(this.cacheCredsFile, JSON.stringify(allCreds))

    return true
  }

  async _getCredentialsFromCacheFile () {
    if (!this.cacheCredsFile) return null

    let creds
    try {
      const content = (await fs.readFile(this.cacheCredsFile)).toString()
      creds = JSON.parse(content)[this.cacheKey]
    } catch (e) {
      return null // cache file does not exist or is invalid
    }
    if (!creds) return null // credentials for namespace do not exist
    // give a minute less to account for the usage time
    if (Date.now() > (Date.parse(creds.expiration) - 60000)) return null
    return creds
  }

  /**
   * Reads the credentials from the TVM or cache
   * @returns {object} credentials for service
   */
  async getCredentials () {
    let creds = await this._getCredentialsFromCacheFile()
    if (!creds) {
      creds = await this._getCredentialsFromTVM()
      await this._cacheCredentialsToFile(creds)
    }
    return creds
  }
}
