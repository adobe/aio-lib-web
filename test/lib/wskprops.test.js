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

'use strict'

const wskprops = require('../../lib/wskprops')
const path = require('path')
const process = require('process')

beforeEach(() => {
    // restores all spies
    jest.restoreAllMocks()
    //global.cleanFs(vol)
})

// tests exported function hasWskConfig()
test('Checks if there is a default wsk config or not', async () => {
    process.env.WSK_CONFIG_FILE = path.resolve('test/wskprops/full.txt')
    let result = wskprops.hasWskConfig()
    expect(result).toEqual(true)

    process.env.WSK_CONFIG_FILE = null
    result = wskprops.hasWskConfig()
    expect(result).toEqual(false)
})


test('Gets wsk properties file from env', async () => {
    process.env.WSK_CONFIG_FILE = path.resolve('test/wskprops/full.txt')
    let config = wskprops.get()
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    console.log(config)
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')

    expect(config.apihost).toEqual('https://adobe.wskprops.test.com')
    expect(config.namespace).toEqual('wskprops_test_namespace')
    expect(config.api_key).toEqual('wskprops_test_auth')
})