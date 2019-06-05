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
const fs = require('fs-extra')
const mockfs = require('mock-fs')
const os = require('os')

process.on('unhandledRejection', error => {
  throw error
})

/* Fake FS */
function readDirIntoObjectSync (dir) {
  const res = {}
  const files = fs.readdirSync(dir)
  files.map(f => {
    const fullPath = path.join(dir, f)
    const stat = fs.statSync(fullPath)
    if (stat.isFile()) {
      res[f] = fs.readFileSync(fullPath).toString()
    } else if (stat.isDirectory()) {
      res[f] = readDirIntoObjectSync(fullPath)
    }
  })
  return res
}

const projectDir = path.resolve(__dirname, '..')
const inMemoryFs = {
  // mockfs cannot read dependencies from the real file system, so we need to mock those
  [path.join(projectDir, 'test', '__fixtures__')]: readDirIntoObjectSync(path.join(projectDir, 'test', '__fixtures__')),
  // [path.join(projectDir, 'test', '__mocks__')]: readDirIntoObjectSync(path.join(projectDir, 'test', '__mocks__')),
  // [path.join(projectDir, 'lib')]: readDirIntoObjectSync(path.join(projectDir, 'lib')),
  // [path.join(projectDir, 'scripts')]: readDirIntoObjectSync(path.join(projectDir, 'scripts')),

  // here we load the modules that are loaded lazily during test execution.
  // We don't want to load all modules as this would slow down tests. It is a known
  // problem for mockfs that we cannot read the real fs while running in the
  // mock fs
  // https://github.com/tschaub/mock-fs/issues/62
  // https://github.com/tschaub/mock-fs/issues/239
  [path.join(projectDir, 'node_modules')]: // readDirIntoObjectSync(path.join(projectDir, 'node_modules'))
  {
    'convert-source-map': readDirIntoObjectSync(path.join(projectDir, 'node_modules', 'convert-source-map')),
    'write-file-atomic': readDirIntoObjectSync(path.join(projectDir, 'node_modules', 'write-file-atomic')),
    'safe-buffer': readDirIntoObjectSync(path.join(projectDir, 'node_modules', 'safe-buffer')),
    'imurmurhash': readDirIntoObjectSync(path.join(projectDir, 'node_modules', 'imurmurhash')),
    'signal-exit': readDirIntoObjectSync(path.join(projectDir, 'node_modules', 'signal-exit'))
  }
}
global.mockFS = () => mockfs(inMemoryFs)

global.resetFS = () => {
  mockfs.restore()
}

global.createTestApp = async () => {
  // for now one app
  const inApp = path.join(projectDir, 'test', '__fixtures__', 'sample-app')
  // unique
  const appDir = path.normalize(`${inApp}-${(+new Date()).toString(36)}-${Math.random().toString(36)}`)

  await fs.copy(inApp, appDir)

  return appDir
}

global.fakeS3Bucket = 'fake-bucket'
global.fakeEnvs = {
  tvm: {
    WHISK_APIHOST: 'https://example.com',
    WHISK_NAMESPACE: 'fake_ns',
    WHISK_AUTH: 'fake:auth',
    TVM_URL: 'https://example.com/api/v1/web/fakens/tvm/get-s3-upload-token'
  },
  creds: {
    WHISK_APIHOST: 'https://example.com',
    WHISK_NAMESPACE: 'fake_ns',
    WHISK_AUTH: 'fake:auth',
    S3_BUCKET: global.fakeS3Bucket,
    AWS_ACCESS_KEY_ID: 'fakeAwsKeyId',
    AWS_SECRET_ACCESS_KEY: 'fakeAwsSecretKey'
  }
}

global.writeEnv = async (env, appDir, except = []) => {
  if (typeof except === 'string') except = [except]
  except = new Set(except)
  await fs.writeFile(path.join(appDir, '.env'),
    Object.keys(env)
      .filter(k => !except.has(k))
      .map(k => `${k}=${env[k]}`)
      .join('\n')
  )
}
global.writeEnvTVM = global.writeEnv.bind(null, global.fakeEnvs.tvm)
global.writeEnvCreds = global.writeEnv.bind(null, global.fakeEnvs.creds)

global.clearProcessEnv = () => {
  delete process.env.WHISK_APIHOST
  delete process.env.WHISK_NAMESPACE
  delete process.env.WHISK_AUTH
  delete process.env.TVM_URL
  delete process.env.AWS_ACCESS_KEY_ID
  delete process.env.AWS_SECRET_ACCESS_KEY
  delete process.env.S3_BUCKET
}

// sync
global.fakeFolder = (dir) => {
  const fakePath = path.join(os.tmpdir(), dir)
  fs.ensureDirSync(fakePath)
  return fakePath
}

global.fakeFiles = async (dir, files) => {
  await fs.ensureDir(dir)
  await Promise.all(files.map(async f => fs.writeFile(path.join(dir, f), 'fake content')))
}

global.fakeTVMResponse = {
  sessionToken: 'fake',
  expiration: '1970-01-01T00:00:00.000Z',
  accessKeyId: 'fake',
  secretAccessKey: 'fake',
  params: { Bucket: global.fakeS3Bucket }
}

global.expectedScripts = expect.objectContaining({
  buildUI: expect.any(Function),
  buildActions: expect.any(Function),
  deployUI: expect.any(Function),
  deployActions: expect.any(Function),
  undeployUI: expect.any(Function),
  undeployActions: expect.any(Function)
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

expect.extend({
  async toThrowWithMessageContaining (received, args) {
    try {
      await received()
    } catch (e) {
      if (typeof args === 'string') args = [args]
      const message = e.message.toLowerCase()
      args.forEach(a => {
        expect(message).toEqual(expect.stringContaining(a.toLowerCase()))
      })
      return { pass: true }
    }
    return { message: () => 'function should have thrown', pass: false }
  }
})
