
const fs = require('fs-extra')
const yaml = require('js-yaml')

class AddAuth {
  static async addAuth (params, manifestFile) {
    console.log(params)
    console.log(manifestFile)
    let manifest = yaml.safeLoad(fs.readFileSync(manifestFile, 'utf8'))
    console.log(manifest)
    return new Promise(function (resolve, reject) {
      let runtimeParams = AddAuth._getCustomConfig(params, 'runtime') || { namespace: 'change-me' }
      let namespace = runtimeParams.namespace
      let shared_namespace = AddAuth._getCustomConfig(params, 'shared_namespace', 'adobeio')
      let {
        client_id = 'change-me',
        client_secret = 'change-me',
        scopes = 'openid,AdobeID',
        base_url = 'https://adobeioruntime.net',
        redirect_url = 'https://www.adobe.com',
        cookie_path = namespace,
        persistence = false,
        my_auth_package = 'myauthp-shared',
        my_cache_package = 'mycachep-shared',
        my_auth_seq_package = 'myauthp'
      } = AddAuth._getCustomConfig(params, 'oauth', {})
      let persistenceBool = persistence && (persistence.toLowerCase() === 'true' || persistence.toLowerCase() === 'yes')
      if (persistenceBool) {
        // TODO : Get accessKeyId and secretAccessKey
      }

      // Adding sequence
      manifest.packages[my_auth_seq_package] = {
        sequences: {
          authenticate: {
            actions: persistenceBool
              ? my_auth_package + '/login,/' +
                                                              shared_namespace + '/cache/encrypt,/' +
                                                              shared_namespace + '/cache/persist,' +
                                                              my_auth_package + '/success'

              : my_auth_package + '/login,/' +
                                                              shared_namespace + '/cache/encrypt,' +
                                                              my_auth_package + '/success',
            web: 'yes'
          }
        }
      }
      // Adding package binding
      manifest.packages[my_auth_seq_package].dependencies = manifest.packages[my_auth_seq_package].dependencies || {}
      manifest.packages[my_auth_seq_package].dependencies[my_auth_package] = {
        location: '/' + shared_namespace + '/oauth',
        inputs: {
          auth_provider: 'adobe-oauth2',
          auth_provider_name: 'adobe',
          client_id: client_id,
          client_secret: client_secret,
          scopes: scopes,
          persistence: persistence,
          callback_url: base_url + '/api/v1/web/' + namespace + '/' + my_auth_seq_package + '/authenticate',
          redirect_url: redirect_url,
          cookie_path: cookie_path,
          cache_namespace: namespace,
          cache_package: my_cache_package
        }
      }

      fs.writeFile('./manifest.yml', yaml.safeDump(manifest), (err) => {
        if (err) {
          console.log(err)
          reject(err)
        }
      })
      resolve()
    })
  }

  static async addJWTAuth (params, manifestFile) {
    let manifest = yaml.safeLoad(fs.readFileSync(manifestFile, 'utf8'))
    return new Promise(function (resolve, reject) {
      let runtime = AddAuth._getCustomConfig(params, 'runtime') || { namespace: 'change-me' }
      let namespace = runtime.namespace
      let shared_namespace = AddAuth._getCustomConfig(params, 'shared_namespace', 'adobeio')
      let {
        client_id = 'change-me',
        client_secret = 'change-me',
        jwt_payload = {},
        jwt_private_key = 'change-me',
        persistence = false,
        my_auth_package = 'myjwtauthp-shared',
        my_cache_package = 'myjwtcachep-shared',
        my_auth_seq_package = 'myjwtauthp'
      } = AddAuth._getCustomConfig(params, 'jwt-auth', {})
      let technical_account_id = jwt_payload.sub
      let org_id = jwt_payload.iss
      let meta_scopes = Object.keys(jwt_payload).filter(key => key.startsWith('http') && jwt_payload[key] === true)
      let persistenceBool = persistence && (persistence.toLowerCase() === 'true' || persistence.toLowerCase() === 'yes')
      if (persistenceBool) {
        // TODO : Get accessKeyId and secretAccessKey
      }

      // Adding sequence
      manifest.packages[my_auth_seq_package] = {
        sequences: {
          authenticate: {
            actions: (persistenceBool ? my_auth_package + '/jwtauth,/adobeio/cache/persist'
              : my_auth_package + '/jwtauth'),
            web: 'yes'
          }
        }
      }
      // Adding package binding
      manifest.packages[my_auth_seq_package].dependencies = manifest.packages[my_auth_seq_package].dependencies || {}
      manifest.packages[my_auth_seq_package].dependencies[my_auth_package] = {
        location: '/' + shared_namespace + '/oauth',
        inputs: {
          jwt_client_id: client_id,
          jwt_client_secret: client_secret,
          technical_account_id: technical_account_id,
          org_id: org_id,
          meta_scopes: JSON.stringify(meta_scopes),
          private_key: JSON.stringify(jwt_private_key.split('\n')),
          persistence: persistence,
          cache_namespace: namespace,
          cache_package: my_cache_package
        }
      }

      fs.writeFile('./manifest.yml', yaml.safeDump(manifest), (err) => {
        if (err) {
          console.log(err)
          reject(err)
        }
      })
      resolve()
    })
  }

  static _getCustomConfig (params, key, defaultValue) {
    return typeof (params[key]) !== 'undefined' ? params[key] : defaultValue
  }
}

module.exports = AddAuth
