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

const path = require('path')
const AbstractScript = require('../../lib/abstract-script')

describe('abstract-script', () => {
  test('Throws error if not passed a config object', async () => {
    return expect(() => {
      // eslint-disable-next-line no-new
      new AbstractScript()
    }).toThrow(/not a valid object/)
  })
  test('Does not throw if passed a config object', async () => {
    return expect(() => {
      // eslint-disable-next-line no-new
      new AbstractScript({})
    }).not.toThrow()
  })
})

describe('run method is abstract', () => {
  test('Throws not implemented error', async () => {
    const absScript = new AbstractScript({})
    await expect(absScript.run()).rejects.toThrow(/Not implemented/)
  })
})

describe('_relApp method', () => {
  test('returns relative path', async () => {
    const absScript = new AbstractScript({ root: 'hello' })
    expect(absScript._relApp('goodbye')).toBe(path.join('..', 'goodbye'))
  })
})

describe('_absApp method', () => {
  test('returns absolute path', async () => {
    const absScript = new AbstractScript({ root: 'hello' })
    expect(absScript._absApp('goodbye')).toBe(path.join('hello', 'goodbye'))
  })
})
