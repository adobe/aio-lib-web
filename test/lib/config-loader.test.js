/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const loadConfig = require('../../lib/config-loader')
const path = require('path')
const process = require('process')

test('Loads settings from env variables', async () => {
    process.env.WSK_CONFIG_FILE = path.resolve('test/wskprops/full.txt')

    const appConfig = loadConfig()
    // console.log('----------------------------------')
    // console.log(appConfig)
    // console.log('----------------------------------')
    expect(appConfig.ow.auth).toEqual("wskprops_test_auth")
    expect(appConfig.ow.namespace).toEqual("wskprops_test_namespace")
    expect(appConfig.ow.apihost).toEqual("https://adobe.wskprops.test.com")

    process.env.WSK_CONFIG_FILE = null
})