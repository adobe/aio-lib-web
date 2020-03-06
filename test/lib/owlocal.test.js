/*
Copyright 20290 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const execa = require('execa')
const owlocal = require('../../lib/owlocal')

jest.mock('execa')
let originalPlatform

function setPlatform (platform) {
  Object.defineProperty(process, 'platform', {
    value: platform
  })
}

beforeAll(() => {
  // save
  originalPlatform = process.platform
})

afterAll(() => {
  // restore
  setPlatform(originalPlatform)
})

const LOCALHOST_URL = `http://localhost:${owlocal.OW_LOCAL_DOCKER_PORT}`

describe('owlocal - docker network inspect bridge', () => {
  test('error - windows or mac', () => {
    setPlatform('win32')
    execa.sync = jest.fn(() => {
      return {
        stdout: '[]'
      }
    })
    expect(owlocal.getDockerNetworkAddress()).toEqual(LOCALHOST_URL)
  })
  test('error - other unix', () => {
    setPlatform('freebsd')
    execa.sync = jest.fn(() => {
      return {
        stdout: '[]'
      }
    })
    expect(owlocal.getDockerNetworkAddress()).toEqual(LOCALHOST_URL)
  })
  test('success - windows or mac', () => {
    setPlatform('darwin')
    const ip = 'unused.ip'
    const output = [
      {
        IPAM: {
          Config: [
            {
              Gateway: ip
            }
          ]
        }
      }
    ]
    execa.sync = jest.fn(() => {
      return {
        stdout: JSON.stringify(output)
      }
    })
    expect(owlocal.getDockerNetworkAddress()).toEqual(LOCALHOST_URL)
  })
  test('success - other unix', () => {
    setPlatform('linux')
    const ip = '127.0.0.1'
    const output = [
      {
        IPAM: {
          Config: [
            {
              Gateway: ip
            }
          ]
        }
      }
    ]
    execa.sync = jest.fn(() => {
      return {
        stdout: JSON.stringify(output)
      }
    })
    expect(owlocal.getDockerNetworkAddress()).toEqual(`http://${ip}:${owlocal.OW_LOCAL_DOCKER_PORT}`)
  })
})
