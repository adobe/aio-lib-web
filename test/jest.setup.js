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

const cloneDeep = require('lodash.clonedeep')
const path = require('path')

jest.setTimeout(10000)

process.on('unhandledRejection', error => {
  throw error
})

const fixturePath = path.join(__dirname, '__fixtures__')

// quick normalization to test windows paths
global.n = p => path.normalize(p)
global.r = p => path.resolve(p)

/**
 * reads a dir or a file to a json
 * if filePath is a dir at /a/b/c/ and contains d/e.txt f/g/h.txt and toDir is /adir/ will return a json:
 * ```
 * {
 *  "/adir/d/e.txt": "<content>",
 *  "/adir/f/g/h.txt": "<content>"
 * }
 * ```
 *
 * @param {string} filePath
 * @param {string} toDir
 * @returns {object}
 */
function readFilesIntoObjectSync (filePath, toDir) {
  const fsReal = jest.requireActual('fs')
  const flatObj = {}

  function _readFilesIntoObjectSync (_filePathRec, _toDirRec, first = false) {
    const stat = fsReal.statSync(_filePathRec)
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(_filePathRec + ' is not a valid file, cannot be addded to mockfs')
    }
    if (stat.isFile()) {
      flatObj[path.join(_toDirRec, path.basename(_filePathRec))] = fsReal.readFileSync(_filePathRec).toString()
      return
    }
    // is dir
    const files = fsReal.readdirSync(_filePathRec)
    files.forEach(f => {
      const fullPath = path.join(_filePathRec, f)
      // skip first dir from path
      _readFilesIntoObjectSync(fullPath, first ? _toDirRec : path.join(_toDirRec, path.basename(_filePathRec)))
    })
  }
  _readFilesIntoObjectSync(filePath, toDir, true)
  return flatObj
}

global.mockFs = () => {
  const memfs = require('memfs')
  const vol = memfs.vol
  const mockFs = memfs.fs
  jest.mock('fs', () => mockFs)

  return { vol, fs: mockFs }
}

global.loadFs = (vol, fixtures) => {
  if (typeof fixtures === 'string') fixtures = [fixtures]
  const jsonFs = fixtures
    .map(f => readFilesIntoObjectSync(path.join(fixturePath, f), '/')) // => [{}, {}, ..]
    .reduce((aggregate, currObj) => ({ ...aggregate, ...currObj }), {}) // => {}
  // For now we can only store files on / as chdir does not recognize mock fs files and we rely on cwd to set the root
  // path of the project
  // todo have an option to pass rootDir as arg instead of cwd
  vol.fromJSON(jsonFs, '/', { reset: true })
  process.chdir('/')
}

global.cleanFs = vol => vol.reset()

global.addFakeFiles = (vol, dir, files) => {
  if (typeof files === 'string') files = [files]
  if (Array.isArray(files)) files = files.reduce((obj, curr) => { obj[curr] = 'fake-content'; return obj }, {})
  vol.mkdirpSync(dir)
  Object.keys(files).forEach(f => {
    const filePath = path.join(dir, f)
    // create intermediate directories if neccessary
    vol.mkdirSync(path.dirname(filePath), { recursive: true })
    vol.writeFileSync(filePath, files[f])
  })
}

global.configWithMissing = (config, members) => {
  if (typeof members === 'string') members = [members]
  config = cloneDeep(config)
  members.forEach(m => {
    // a config member can be hierarchical e.g. 'my.config.that.i.want.to.remove'
    const split = m.split('.')
    const last = split.pop()
    const traverse = split.reduce((_traverse, next) => _traverse[next], config)
    delete traverse[last]
  })
  return config
}

global.configWithModifiedWeb = (config, newWebConfig) => {
  config = cloneDeep(config)
  config.web = newWebConfig
  return config
}

global.fakeS3Bucket = 'fake-bucket'
global.fakeConfig = {
  tvm: {
    runtime: {
      namespace: 'fake_ns',
      auth: 'fake:auth'
    }
  },
  local: {
    runtime: {
      // those must match the once set by dev cmd
      apihost: 'http://localhost:3233',
      namespace: 'guest',
      auth: '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'
    }
  },
  creds: {
    runtime: {
      namespace: 'fake_ns',
      auth: 'fake:auth'
    },
    cna: {
      s3bucket: 'customBucket',
      awsaccesskeyid: 'fakeAwsKeyId',
      awssecretaccesskey: 'fakeAwsSecretKey'
    }
  },
  app: {
    htmlCacheDuration: 60,
    jsCacheDuration: 604800,
    cssCacheDuration: 604800,
    imageCacheDuration: 604800
  },
  web: {
    'response-headers': {
      '/*': {
        testHeader: 'foo'
      }
    }
  }
}

global.fakeTVMResponse = {
  sessionToken: 'fake',
  expiration: '1970-01-01T00:00:00.000Z',
  accessKeyId: 'fake',
  secretAccessKey: 'fake',
  params: { Bucket: global.fakeS3Bucket }
}

global.fakeBYOCredentials = {
  accessKeyId: 'fake',
  secretAccessKey: 'fake',
  params: { Bucket: global.fakeS3Bucket }
}

global.expectedScripts = expect.objectContaining({
  buildUI: expect.any(Function),
  deployUI: expect.any(Function),
  undeployUI: expect.any(Function)
})

global.expectedS3ENVCreds = expect.objectContaining({
  accessKeyId: expect.any(String),
  secretAccessKey: expect.any(String),
  params: { Bucket: expect.any(String) }
})

global.expectedS3TVMCreds = expect.objectContaining({
  sessionToken: expect.any(String),
  expiration: expect.any(String),
  accessKeyId: expect.any(String),
  secretAccessKey: expect.any(String),
  params: { Bucket: expect.any(String) }
})

global.defaultAppHostName = 'adobeio-static.net'
global.defaultTvmUrl = 'https://adobeio.adobeioruntime.net/apis/tvm/'
global.defaultOwApiHost = 'https://adobeioruntime.net'

expect.extend({
  async toThrowWithMessageContaining (received, args) {
    try {
      await received()
    } catch (e) {
      if (typeof args === 'string') args = [args]
      const message = e.message.toLowerCase()
      for (let i = 0; i < args.length; ++i) {
        const a = args[i].toLowerCase()
        if (message.indexOf(a) < 0) {
          return { message: () => `expected "${message}" to contain "${a}"`, pass: false }
        }
      }
      return { pass: true }
    }
    return { message: () => 'function should have thrown', pass: false }
  }
})
