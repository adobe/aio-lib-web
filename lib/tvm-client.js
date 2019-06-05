const joi = require('joi')
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
    const res = joi.validate(params, joi.object().keys({
      owNamespace: joi.string().required(),
      owAuth: joi.string().required(),
      tvmUrl: joi.string().uri().required(),
      cacheCredsFile: joi.string()
    }).unknown())
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
