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

const TVMClient = require('../../lib/tvm-client')
const fs = require('fs-extra')
const path = require('path')

const maxDate = new Date(8640000000000000).toISOString()
const minDate = new Date(-8640000000000000).toISOString()

let fakeDir
beforeAll(async () => {
  fakeDir = global.fakeFolder('someFolder')
})

let fakeTVMInput
beforeEach(async () => {
  fakeTVMInput = {
    owNamespace: 'fake',
    owAuth: 'fake',
    tvmUrl: 'https://fake.com',
    // caching enabled
    cacheCredsFile: path.join(fakeDir, 'cache.json')
  }
})

afterEach(async () => {
  // restores all spies
  await jest.restoreAllMocks()
  await fs.emptyDir(fakeDir)
})

test('constructor should throw an error on empty input', async () => {
  const instantiate = () => new TVMClient({})
  expect(instantiate.bind(this)).toThrowWithMessageContaining(['required'])
})

test('getCredentials w/o caching should return the tvm response', async () => {
  // fake the request to the TVM
  jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)
  delete fakeTVMInput.cacheCredsFile
  const tvmClient = new TVMClient(fakeTVMInput)
  const creds = await tvmClient.getCredentials()
  expect(creds).toEqual(global.fakeTVMResponse)
})

test('getCredentials with caching should cache the tvm response to the appropriate file', async () => {
  // fake the request to the TVM
  jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)

  const tvmClient = new TVMClient(fakeTVMInput)
  await tvmClient.getCredentials()

  expect(await fs.exists(fakeTVMInput.cacheCredsFile)).toBe(true)
})

test('getCredentials with caching should cache the tvm response into a {ns-tvm: tvm_response} key_value pair', async () => {
  // fake the request to the TVM
  jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)

  const tvmClient = new TVMClient(fakeTVMInput)
  await tvmClient.getCredentials()

  const content = JSON.parse((await fs.readFile(fakeTVMInput.cacheCredsFile)).toString())[`${fakeTVMInput.owNamespace}-${fakeTVMInput.tvmUrl}`]
  expect(content).toEqual(global.fakeTVMResponse)
})

test('getCredentials with a previous non expired cache should return the cache content and not request the TVM', async () => {
  // fake the request to the TVM but should actually not do
  const spy = jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)

  // add pre-exisiting cache
  const cacheKey = `${fakeTVMInput.owNamespace}-${fakeTVMInput.tvmUrl}`
  const cacheContent = { [cacheKey]: { expiration: maxDate, fake: 'fake' } }
  await fs.writeFile(fakeTVMInput.cacheCredsFile, JSON.stringify(cacheContent))

  const tvmClient = new TVMClient(fakeTVMInput)
  const res = await tvmClient.getCredentials()

  expect(spy).toHaveBeenCalledTimes(0)
  expect(res).toEqual(expect.objectContaining(cacheContent[cacheKey]))
})

test('getCredentials with a previous cache for another cacheKey should append to that cache the tvm response', async () => {
  // fake the request to the TVM but should actually not do
  const spy = jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)

  // add pre-exisiting cache
  const previousCacheKey = `fakeKey`
  const cacheContent = { [previousCacheKey]: { expiration: maxDate, fake: 'fake' } }
  await fs.writeFile(fakeTVMInput.cacheCredsFile, JSON.stringify(cacheContent))

  const tvmClient = new TVMClient(fakeTVMInput)
  await tvmClient.getCredentials()

  expect(spy).toHaveBeenCalledTimes(1)
  const cacheKey = `${fakeTVMInput.owNamespace}-${fakeTVMInput.tvmUrl}`
  const newCacheContent = JSON.parse((await fs.readFile(fakeTVMInput.cacheCredsFile)).toString())
  expect(newCacheContent).toEqual(expect.objectContaining({ ...cacheContent, [cacheKey]: global.fakeTVMResponse }))
})

test('getCredentials with a previous expired cache should return the TVM response', async () => {
  // fake the request to the TVM but should actually not do
  const spy = jest.spyOn(TVMClient.prototype, '_getCredentialsFromTVM').mockReturnValue(global.fakeTVMResponse)

  // add pre-exisiting cache
  await fs.writeFile(fakeTVMInput.cacheCredsFile, JSON.stringify({ [`${fakeTVMInput.owNamespace}-${fakeTVMInput.tvmUrl}`]: { expiration: minDate, fake: 'fake' } }))

  const tvmClient = new TVMClient(fakeTVMInput)
  const res = await tvmClient.getCredentials()

  expect(spy).toHaveBeenCalledTimes(1)
  expect(res).toEqual(global.fakeTVMResponse)
})
