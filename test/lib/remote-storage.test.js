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

const mockS3 = {
  listObjectsV2: jest.fn(),
  deleteObjects: jest.fn(),
  putObject: jest.fn()
}

jest.mock('@aws-sdk/client-s3', () => Object({ S3: jest.fn(() => { return mockS3 }) }))

const { S3 } = require('@aws-sdk/client-s3')
const { vol } = global.mockFs()

const RemoteStorage = require('../../lib/remote-storage')

describe('RemoteStorage', () => {
  beforeEach(() => {
    // resets all mock s3 functions, do not use jest.resetAllMocks() as it also resets the s3 client constructor mock
    mockS3.listObjectsV2.mockReset()
    mockS3.deleteObjects.mockReset()
    mockS3.putObject.mockReset()
    S3.mockClear()
    // resets the mock fs
    global.cleanFs(vol)
  })

  test('Constructor should throw when missing credentials', async () => {
    const instantiate = () => new RemoteStorage({})
    expect(instantiate.bind(this)).toThrowWithMessageContaining(['required'])
  })

  test('Constructor initializes the S3 constructor properly using tvm credentials', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect(S3).toHaveBeenCalledWith({
      credentials: {
        accessKeyId: global.fakeTVMResponse.accessKeyId,
        secretAccessKey: global.fakeTVMResponse.secretAccessKey,
        sessionToken: global.fakeTVMResponse.sessionToken,
        expiration: global.fakeTVMResponse.expiration
      },
      region: 'us-east-1'
    })
    rs.bucket = global.fakeTVMResponse.Bucket
  })

  test('Constructor initializes the S3 constructor properly using byo credentials', async () => {
    const rs = new RemoteStorage(global.fakeBYOCredentials)
    expect(S3).toHaveBeenCalledWith({
      credentials: {
        accessKeyId: global.fakeTVMResponse.accessKeyId,
        secretAccessKey: global.fakeTVMResponse.secretAccessKey
      },
      region: 'us-east-1'
    })
    rs.bucket = global.fakeTVMResponse.Bucket
  })

  test('folderExists missing prefix', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await expect(rs.folderExists()).rejects.toEqual(expect.objectContaining({ message: 'prefix must be a valid string' }))
  })

  test('emptyFolder missing prefix', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await expect(rs.emptyFolder()).rejects.toEqual(expect.objectContaining({ message: 'prefix must be a valid string' }))
  })

  test('uploadFile missing prefix', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await expect(rs.uploadFile()).rejects.toEqual(expect.objectContaining({ message: 'prefix must be a valid string' }))
  })

  test('uploadDir missing prefix', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await expect(rs.uploadDir()).rejects.toEqual(expect.objectContaining({ message: 'prefix must be a valid string' }))
  })

  test('folderExists should return false if there are no files', async () => {
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 0 })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect((await rs.folderExists('fakeprefix'))).toBe(false)
    expect(mockS3.listObjectsV2).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Prefix: 'fakeprefix' })
  })

  test('folderExists should return true if there are files', async () => {
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 1 })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect((await rs.folderExists('fakeprefix'))).toBe(true)
  })

  test('emptyFolder should not throw if there are no files', async () => {
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 0 })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect(rs.emptyFolder.bind(rs, 'fakeprefix')).not.toThrow()
  })

  test('emptyFolder should not call S3#deleteObjects if already empty', async () => {
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 0 })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockS3.deleteObjects).toHaveBeenCalledTimes(0)
  })

  test('emptyFolder should call S3#deleteObjects with correct parameters with one file', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }]
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 1, Contents: content })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockS3.deleteObjects).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Delete: { Objects: content } })
  })

  test('emptyFolder should call S3#deleteObjects with correct parameters with multiple files', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }, { Key: 'fakeprefix/index.css' }, { Key: 'fakeprefix/index.css' }]
    mockS3.listObjectsV2.mockResolvedValue({ KeyCount: 3, Contents: content })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockS3.deleteObjects).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Delete: { Objects: content } })
  })

  test('emptyFolder should call S3#deleteObjects multiple time if listObjects is truncated', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }, { Key: 'fakeprefix/index.css' }, { Key: 'fakeprefix/index.js' }]
    let iterations = 2
    mockS3.listObjectsV2.mockImplementation(() => {
      const res = { Contents: [content[iterations]], IsTruncated: iterations > 0 }
      iterations--
      return Promise.resolve(res)
    })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockS3.deleteObjects).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Delete: { Objects: [content[0]] } })
    expect(mockS3.deleteObjects).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Delete: { Objects: [content[1]] } })
    expect(mockS3.deleteObjects).toHaveBeenCalledWith({ Bucket: 'fake-bucket', Delete: { Objects: [content[2]] } })
  })

  test('uploadFile should call S3#upload with the correct parameters', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = global.fakeConfig
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'fake-bucket', Key: 'fakeprefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile should call S3#upload with the correct parameters and slash-prefix', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = global.fakeConfig
    await rs.uploadFile('fakeDir/index.js', '/slash-prefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'fake-bucket', Key: '/slash-prefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile S3#upload with an unknown Content-Type', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.mst': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.mst', 'fakeprefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'fake-bucket', Key: 'fakeprefix/index.mst', Body: body }))
    expect(mockS3.putObject.mock.calls[0][0]).not.toHaveProperty('ContentType')
  })

  test('uploadDir should call S3#upload one time per file', async () => {
    await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html'])
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.uploadDir('fakeDir', 'fakeprefix', global.fakeConfig)
    expect(mockS3.putObject).toHaveBeenCalledTimes(3)
  })

  test('uploadDir should call a callback once per uploaded file', async () => {
    await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html', 'test/i.js'])
    const cbMock = jest.fn()
    const rs = new RemoteStorage(global.fakeTVMResponse)

    await rs.uploadDir('fakeDir', 'fakeprefix', global.fakeConfig, cbMock)
    expect(cbMock).toHaveBeenCalledTimes(4)
  })

  test('cachecontrol string for html', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('text/html', global.fakeConfig.app)
    expect(response).toBe('s-maxage=0, max-age=60')
  })

  test('cachecontrol string for JS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/javascript', global.fakeConfig.app)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for CSS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('text/css', global.fakeConfig.app)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for Image', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('image/jpeg', global.fakeConfig.app)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for default', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/pdf', global.fakeConfig.app)
    expect(response).toBe('s-maxage=0')
  })

  // response header tests
  test('get response header from config with multiple rules', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        },
        '/testfolder/*': {
          testHeader: 'folder-header'
        },
        '/testfolder/*.js': {
          testHeader: 'all-js-file-in-folder-header'
        },
        '/test.js': {
          testHeader: 'specific-file-header'
        }
      }
    })

    const fakeDistRoot = '/fake/web-prod/'

    // check application of generic rule /*
    let response = rs.getResponseHeadersForFile(fakeDistRoot + 'index.html', fakeDistRoot, newConfig)
    let expected = {
      'adp-testHeader': 'generic-header'
    }
    expect(response).toStrictEqual(expected)

    // check application of folder content rule /testfolder/*
    response = rs.getResponseHeadersForFile(fakeDistRoot + 'testfolder/index.html', fakeDistRoot, newConfig)
    expected = {
      'adp-testHeader': 'folder-header'
    }
    expect(response).toStrictEqual(expected)

    // check application of specific extension within folder /testfolder/*.js
    response = rs.getResponseHeadersForFile(fakeDistRoot + 'testfolder/test.js', fakeDistRoot, newConfig)
    expected = {
      'adp-testHeader': 'all-js-file-in-folder-header'
    }
    expect(response).toStrictEqual(expected)

    // check application of specific file
    response = rs.getResponseHeadersForFile(fakeDistRoot + 'test.js', fakeDistRoot, newConfig)
    expected = {
      'adp-testHeader': 'specific-file-header'
    }
    expect(response).toStrictEqual(expected)
  })

  test('get response header with invalid header name', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          無効な名前: 'generic-header'
        }
      }
    })

    const fakeDistRoot = '/fake/web-prod/'
    expect(() => rs.getResponseHeadersForFile(fakeDistRoot + 'index.html', fakeDistRoot, newConfig)).toThrowWithMessageContaining(
      '[WebLib:ERROR_INVALID_HEADER_NAME] `無効な名前` is not a valid response header name')
  })

  test('get response header with invalid header value', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: '無効な値'
        }
      }
    })

    const fakeDistRoot = '/fake/web-prod/'
    expect(() => rs.getResponseHeadersForFile(fakeDistRoot + 'index.html', fakeDistRoot, newConfig)).toThrowWithMessageContaining(
      '[WebLib:ERROR_INVALID_HEADER_VALUE] `無効な値` is not a valid response header value for `testHeader`')
  })

  test('Metadata check for response headers', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        }
      }
    })
    // const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', newConfig)
    const body = Buffer.from('fake content', 'utf8')
    const expected = {
      Bucket: 'fake-bucket',
      Key: 'fakeprefix/index.js',
      Body: body,
      ContentType: 'application/javascript',
      Metadata: {
        'adp-testHeader': 'generic-header'
      }
    }
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining(expected))
  })
})
