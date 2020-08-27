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
const utils = require('../../lib/utils')

describe('lib/utils', () => {
  test('exists and has methods', async () => {
    expect(utils).toBeDefined()
    expect(utils.getActionUrls).toBeDefined()
    expect(typeof utils.getActionUrls).toBe('function')
    expect(utils.urlJoin).toBeDefined()
    expect(typeof utils.urlJoin).toBe('function')
    expect(utils.removeProtocolFromURL).toBeDefined()
    expect(typeof utils.removeProtocolFromURL).toBe('function')
  })

  test('urlJoin', () => {
    let res = utils.urlJoin('a', 'b', 'c')
    expect(res).toBe('a/b/c')
    // keeps leading /
    res = utils.urlJoin('/', 'a', 'b', 'c')
    expect(res).toBe('/a/b/c')

    res = utils.urlJoin('/a/b/c')
    expect(res).toBe('/a/b/c')
    // keeps inner /
    res = utils.urlJoin('a/b/c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', 'c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', '/c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a/b', '/', 'c')
    expect(res).toBe('a/b/c')
    // collapses duplicate //
    res = utils.urlJoin('a/b', '/', '/', '/', 'c')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a', 'b', 'c/')
    expect(res).toBe('a/b/c')

    res = utils.urlJoin('a', 'b', 'c', '/')
    expect(res).toBe('a/b/c')

    // TODO: more?
  })

  test('removeProtocol', () => {
    let res = utils.removeProtocolFromURL('https://some-url')
    expect(res).toBe('some-url')

    res = utils.removeProtocolFromURL('https:/some-url')
    expect(res).toBe('https:/some-url')

    res = utils.removeProtocolFromURL('https:some-url')
    expect(res).toBe('https:some-url')

    res = utils.removeProtocolFromURL('https//some-url')
    expect(res).toBe('https//some-url')

    res = utils.removeProtocolFromURL('http://user:pass@sub.example.com:8080/p/a/t/h?query=string#hash')
    expect(res).toBe('user:pass@sub.example.com:8080/p/a/t/h?query=string#hash')
  })
})
