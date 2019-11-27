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
const Readable = require('stream').Readable

const mockConstructor = jest.fn()
const mockDirectory = jest.fn()
const mockFile = jest.fn()
const mockArchive = () => {
  let done = false
  const ret = new Readable({
    read: function () { if (done) this.push(null); else this.push('a') }
  })
  ret.file = mockFile
  ret.directory = mockDirectory
  ret.finalize = () => { done = true; ret.destroy() }
  return ret
}

const archiver = function (...args) {
  mockConstructor(args)
  return mockArchive()
}

archiver.mockFile = mockFile
archiver.mockDirectory = mockDirectory
archiver.mockConstructor = mockConstructor
archiver.mockReset = () => {
  mockConstructor.mockReset()
  mockDirectory.mockReset()
  mockFile.mockReset()
}

// todo mock errors to be able to run error cb registered by on('error', cb)

module.exports = archiver
