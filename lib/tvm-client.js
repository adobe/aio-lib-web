const joi = require('joi')
const fs = require('fs-extra')
const request = require('request-promise')

module.exports = class TVMClient {
  /**
   * @param  {object} params
   * @param  {object} params.tvmUrl
   * @param  {object} params.owAuth
   * @param  {object} params.owNamespace
   * @param  {object} [params.cacheCredsFile] if omitted no caching (not recommended)
   */
  constructor (params) {
    const res = joi.validate(params, joi.object().keys({
      owNamespace: joi.string().required(),
      owAuth: joi.string().required(),
      tvmUrl: joi.string().uri().required(),
      cacheCredsFile: joi.string()
    }))
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
      allCreds = require(this.cacheCredsFile)
    } catch (e) {
      allCreds = {} // cache file does not exist
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
      creds = require(this.cacheCredsFile)[this.cacheKey]
    } catch (e) {
      return null // cache file does not exist
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
