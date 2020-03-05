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

describe('owlocal - docker network inspect bridge', () => {
  test('error', () => {
    execa.sync = jest.fn(() => {
      return {
        stdout: '[]'
      }
    })
    expect(owlocal.getDockerNetworkAddress()).toEqual(null)
  })
  test('success', () => {
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
