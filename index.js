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

const buildWeb = require('./src/build-web')
const deployWeb = require('./src/deploy-web')
const undeployWeb = require('./src/undeploy-web')
const bundle = require('./src/bundle')

/**
 * Adobe I/O app lib web, build / deploy webapps to cdn
 * @module adobe/aio-lib-web
 */

/**
 * @typedef AppLibWeb
 * @type {object}
 * @property {function(object):Promise<undefined>} bundles - bundles the application's static files
 * @property {function(object):Promise<undefined>} buildWeb - bundles the application's static files
 * @property {function(object):Promise<string>} deployWeb - deploys the static files to a CDN, returns the URL
 * @property {function(object):Promise<undefined>} undeployWeb - removes the deployed static files
 */

module.exports = {
  bundle,
  buildWeb,
  deployWeb,
  undeployWeb
}
