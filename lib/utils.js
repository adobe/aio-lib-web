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

// TODO: those utils are exposed in the runtime-lib too, delete this file when moving last
// ui related scripts out of app-scripts

function getActionUrls (config, /* istanbul ignore next */ isRemoteDev = false, /* istanbul ignore next */ isLocalDev = false) {
  // set action urls
  // action urls {name: url}, if !LocalDev subdomain uses namespace
  return Object.entries({ ...config.manifest.package.actions, ...(config.manifest.package.sequences || {}) }).reduce((obj, [name, action]) => {
    const webArg = action['web-export'] || action.web
    const webUri = (webArg && webArg !== 'no' && webArg !== 'false') ? 'web' : ''
    // if (isLocalDev) {
    //   // http://localhost:3233/api/v1/web/<ns>/<package>/<action>
    //   obj[name] = urlJoin(config.ow.apihost, 'api', config.ow.apiversion, webUri, config.ow.namespace, config.ow.package, name)
    // } else if ..
    if (isRemoteDev || !webUri || !config.app.hasFrontend) {
      // - if remote dev we don't care about same domain as the UI runs on localhost
      // - if action is non web it cannot be called from the UI and we can point directly to ApiHost domain
      // - if action has no UI no need to use the CDN url
      // NOTE this will not work for apihosts that do not support <ns>.apihost url
      // https://<ns>.adobeioruntime.net/api/v1/web/<package>/<action>
      obj[name] = urlJoin('https://' + config.ow.namespace + '.' + removeProtocolFromURL(config.ow.apihost), 'api', config.ow.apiversion, webUri, config.ow.package, name)
    } else {
      // https://<ns>.adobe-static.net/api/v1/web/<package>/<action>
      obj[name] = urlJoin('https://' + config.ow.namespace + '.' + removeProtocolFromURL(config.app.hostname), 'api', config.ow.apiversion, webUri, config.ow.package, name)
    }
    return obj
  }, {})
}

/**
 * Joins url path parts
 * @param {...string} args url parts
 * @returns {string}
 */
function urlJoin (...args) {
  let start = ''
  if (args[0] && args[0].startsWith('/')) start = '/'
  return start + args.map(a => a && a.replace(/(^\/|\/$)/g, ''))
    .filter(a => a) // remove empty strings / nulls
    .join('/')
}

/**
 * Removes the protocol prefix from a URL string
 * @param {string} url the input url string
 * @returns {string} the url without the protocol prefix
 */
function removeProtocolFromURL (url) {
  // will replace strings like '<protocol>://hello.com' and  '//hello.com' with
  // 'hello.com'
  return url.replace(/(^\w+:|^)\/\//, '')
}

module.exports = {
  urlJoin,
  getActionUrls,
  removeProtocolFromURL
}
