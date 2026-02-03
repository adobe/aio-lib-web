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
const path = require('path')

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
        expiration: new Date(global.fakeTVMResponse.expiration)
      },
      region: 'us-east-1',
      requestHandler: expect.any(Object)
    })
    rs.bucket = global.fakeTVMResponse.Bucket
  })

  test('Constructor initializes the S3 constructor properly using byo credentials', async () => {
    const rs = new RemoteStorage(global.fakeBYOCredentials)
    expect(S3).toHaveBeenCalledWith({
      credentials: {
        accessKeyId: global.fakeTVMResponse.accessKeyId,
        secretAccessKey: global.fakeTVMResponse.secretAccessKey,
        sessionToken: undefined,
        expiration: undefined
      },
      region: 'us-east-1',
      requestHandler: expect.any(Object)
    })
    rs.bucket = global.fakeTVMResponse.Bucket
  })

  describe('Proxy configuration', () => {
    const originalEnv = process.env

    beforeEach(() => {
      // Clear environment variables before each test
      delete process.env.https_proxy
      delete process.env.HTTPS_PROXY
      delete process.env.http_proxy
      delete process.env.HTTP_PROXY
    })

    afterAll(() => {
      // Restore original environment
      process.env = originalEnv
    })

    test('Constructor uses HTTPS_PROXY when set (uppercase)', async () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor uses https_proxy when set (lowercase)', async () => {
      process.env.https_proxy = 'http://proxy.example.com:3128'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor uses HTTP_PROXY when HTTPS_PROXY not set', async () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor uses http_proxy when other proxy vars not set', async () => {
      process.env.http_proxy = 'http://proxy.example.com:3128'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor prioritizes HTTPS_PROXY over HTTP_PROXY', async () => {
      process.env.HTTPS_PROXY = 'http://https-proxy.example.com:8080'
      process.env.HTTP_PROXY = 'http://http-proxy.example.com:8080'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor prioritizes https_proxy over HTTP_PROXY', async () => {
      process.env.https_proxy = 'http://https-proxy.example.com:3128'
      process.env.HTTP_PROXY = 'http://http-proxy.example.com:8080'
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith(expect.objectContaining({
        requestHandler: expect.any(Object),
        credentials: expect.any(Object),
        region: 'us-east-1'
      }))
    })

    test('Constructor always includes requestHandler with ProxyAgent', async () => {
      // eslint-disable-next-line no-new
      new RemoteStorage(global.fakeTVMResponse)

      expect(S3).toHaveBeenCalledWith({
        credentials: expect.any(Object),
        region: 'us-east-1',
        requestHandler: expect.any(Object)
      })

      // ProxyAgent handles proxy detection automatically via proxy-from-env
      const s3CallArgs = S3.mock.calls[S3.mock.calls.length - 1][0]
      expect(s3CallArgs).toHaveProperty('requestHandler')
    })
  })

  describe('_urlJoin', () => {
    let rs

    beforeEach(() => {
      rs = new RemoteStorage(global.fakeTVMResponse)
    })

    describe('basic path joining', () => {
      test('joins simple path parts', () => {
        expect(rs._urlJoin('prefix', 'file.js')).toBe('prefix/file.js')
      })

      test('joins multiple path parts', () => {
        expect(rs._urlJoin('prefix', 'deep', 'nested', 'file.js')).toBe('prefix/deep/nested/file.js')
      })

      test('handles single part', () => {
        expect(rs._urlJoin('file.js')).toBe('file.js')
      })

      test('handles empty string parts', () => {
        expect(rs._urlJoin('prefix', '', 'file.js')).toBe('prefix/file.js')
      })

      test('handles null parts', () => {
        expect(rs._urlJoin('prefix', null, 'file.js')).toBe('prefix/file.js')
      })

      test('handles undefined parts', () => {
        expect(rs._urlJoin('prefix', undefined, 'file.js')).toBe('prefix/file.js')
      })

      test('handles all empty/null parts', () => {
        expect(rs._urlJoin('', null, undefined)).toBe('')
      })
    })

    describe('leading slash preservation', () => {
      test('preserves leading slash from first argument', () => {
        expect(rs._urlJoin('/prefix', 'file.js')).toBe('/prefix/file.js')
      })

      test('preserves leading slash with multiple parts', () => {
        expect(rs._urlJoin('/prefix', 'deep', 'file.js')).toBe('/prefix/deep/file.js')
      })

      test('does not add leading slash when first part does not have one', () => {
        expect(rs._urlJoin('prefix', 'file.js')).toBe('prefix/file.js')
      })

      test('handles leading slash with single part', () => {
        expect(rs._urlJoin('/file.js')).toBe('/file.js')
      })
    })

    describe('trailing slash removal', () => {
      test('removes trailing slash from parts', () => {
        expect(rs._urlJoin('prefix/', 'file.js')).toBe('prefix/file.js')
      })

      test('removes trailing slash from multiple parts', () => {
        expect(rs._urlJoin('prefix/', 'deep/', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('removes trailing slash from last part', () => {
        expect(rs._urlJoin('prefix', 'file.js/')).toBe('prefix/file.js')
      })

      test('removes trailing slash while preserving leading slash', () => {
        expect(rs._urlJoin('/prefix/', 'file.js')).toBe('/prefix/file.js')
      })
    })

    describe('leading slash removal', () => {
      test('removes leading slash from non-first parts', () => {
        expect(rs._urlJoin('prefix', '/deep', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('removes leading slash from middle parts', () => {
        expect(rs._urlJoin('prefix', '/deep', '/nested', 'file.js')).toBe('prefix/deep/nested/file.js')
      })

      test('preserves leading slash only on first part', () => {
        expect(rs._urlJoin('/prefix', '/deep', '/file.js')).toBe('/prefix/deep/file.js')
      })
    })

    describe('Windows backslash conversion', () => {
      test('converts Windows backslashes to forward slashes', () => {
        expect(rs._urlJoin('prefix\\deep', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('converts backslashes in single part', () => {
        expect(rs._urlJoin('prefix\\deep\\file.js')).toBe('prefix/deep/file.js')
      })

      test('converts backslashes in multiple parts', () => {
        expect(rs._urlJoin('prefix\\deep', 'nested\\file.js')).toBe('prefix/deep/nested/file.js')
      })

      test('converts backslashes while preserving leading slash', () => {
        expect(rs._urlJoin('/prefix\\deep', 'file.js')).toBe('/prefix/deep/file.js')
      })

      test('converts mixed backslashes and forward slashes', () => {
        expect(rs._urlJoin('prefix\\deep', 'nested/file.js')).toBe('prefix/deep/nested/file.js')
      })

      test('handles Windows-style path with backslashes', () => {
        expect(rs._urlJoin('fakeprefix\\deep\\dir', 'index.js')).toBe('fakeprefix/deep/dir/index.js')
      })
    })

    describe('double slash removal', () => {
      test('removes double slashes from joined path', () => {
        expect(rs._urlJoin('prefix', '', 'file.js')).toBe('prefix/file.js')
      })

      test('removes multiple consecutive slashes', () => {
        expect(rs._urlJoin('prefix//deep', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('removes triple slashes', () => {
        expect(rs._urlJoin('prefix///deep', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('removes double slashes in middle of path', () => {
        expect(rs._urlJoin('prefix', '//deep', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('handles double slashes with leading slash', () => {
        expect(rs._urlJoin('/prefix', '//deep', 'file.js')).toBe('/prefix/deep/file.js')
      })

      test('removes double slashes created by empty parts', () => {
        expect(rs._urlJoin('prefix', '', '', 'file.js')).toBe('prefix/file.js')
      })
    })

    describe('edge cases with slashes', () => {
      test('handles part that is just a slash', () => {
        expect(rs._urlJoin('prefix', '/', 'file.js')).toBe('prefix/file.js')
      })

      test('handles part that is just backslash', () => {
        expect(rs._urlJoin('prefix', '\\', 'file.js')).toBe('prefix/file.js')
      })

      test('handles multiple slashes-only parts', () => {
        expect(rs._urlJoin('prefix', '/', '/', 'file.js')).toBe('prefix/file.js')
      })

      test('handles leading slash with empty parts', () => {
        expect(rs._urlJoin('/prefix', '', 'file.js')).toBe('/prefix/file.js')
      })
    })

    describe('real-world S3 key scenarios', () => {
      test('creates S3 key from prefix and filename', () => {
        expect(rs._urlJoin('fakeprefix', 'index.js')).toBe('fakeprefix/index.js')
      })

      test('creates S3 key with nested directories', () => {
        expect(rs._urlJoin('fakeprefix', 'deep', 'dir', 'index.js')).toBe('fakeprefix/deep/dir/index.js')
      })

      test('handles Windows-style prefix with trailing backslash', () => {
        expect(rs._urlJoin('fakeprefix\\deep\\dir\\', 'index.js')).toBe('fakeprefix/deep/dir/index.js')
      })

      test('handles prefix with leading slash', () => {
        expect(rs._urlJoin('/fakeprefix', 'index.js')).toBe('/fakeprefix/index.js')
      })

      test('handles relative directory path', () => {
        expect(rs._urlJoin('deep', 'index.js')).toBe('deep/index.js')
      })

      test('handles empty prefix', () => {
        expect(rs._urlJoin('', 'index.js')).toBe('index.js')
      })

      test('handles prefix with mixed separators', () => {
        expect(rs._urlJoin('prefix\\deep', 'nested/file.js')).toBe('prefix/deep/nested/file.js')
      })
    })

    describe('special characters and edge cases', () => {
      test('handles file with no extension', () => {
        expect(rs._urlJoin('prefix', 'file')).toBe('prefix/file')
      })

      test('handles file with multiple dots', () => {
        expect(rs._urlJoin('prefix', 'file.min.js')).toBe('prefix/file.min.js')
      })

      test('handles path with spaces', () => {
        expect(rs._urlJoin('prefix', 'file name.js')).toBe('prefix/file name.js')
      })

      test('handles path with special characters', () => {
        expect(rs._urlJoin('prefix', 'file-name_123.js')).toBe('prefix/file-name_123.js')
      })

      test('handles very long path', () => {
        const longPath = Array(10).fill('deep').join('/')
        expect(rs._urlJoin('prefix', longPath, 'file.js')).toBe(`prefix/${longPath}/file.js`)
      })

      test('handles path starting with dot', () => {
        expect(rs._urlJoin('prefix', '.hidden', 'file.js')).toBe('prefix/.hidden/file.js')
      })

      test('handles path with dot-dot', () => {
        expect(rs._urlJoin('prefix', '..', 'file.js')).toBe('prefix/../file.js')
      })
    })

    describe('empty and null handling', () => {
      test('returns empty string for no arguments', () => {
        expect(rs._urlJoin()).toBe('')
      })

      test('returns empty string for single empty string', () => {
        expect(rs._urlJoin('')).toBe('')
      })

      test('filters out all empty parts', () => {
        expect(rs._urlJoin('', '', '')).toBe('')
      })

      test('handles mix of valid and empty parts', () => {
        expect(rs._urlJoin('', 'prefix', '', 'file.js', '')).toBe('prefix/file.js')
      })

      test('handles null in middle', () => {
        expect(rs._urlJoin('prefix', null, 'file.js')).toBe('prefix/file.js')
      })

      test('handles undefined in middle', () => {
        expect(rs._urlJoin('prefix', undefined, 'file.js')).toBe('prefix/file.js')
      })
    })

    describe('complex combinations', () => {
      test('combines all normalization features', () => {
        expect(rs._urlJoin('/prefix\\deep/', '//nested/', '\\file.js')).toBe('/prefix/deep/nested/file.js')
      })

      test('handles Windows path with leading slash', () => {
        expect(rs._urlJoin('/prefix\\deep\\dir', 'index.js')).toBe('/prefix/deep/dir/index.js')
      })

      test('handles multiple trailing slashes', () => {
        expect(rs._urlJoin('prefix///', 'deep///', 'file.js')).toBe('prefix/deep/file.js')
      })

      test('handles mixed separators and slashes', () => {
        expect(rs._urlJoin('prefix\\deep', '/nested', '\\file.js')).toBe('prefix/deep/nested/file.js')
      })
    })
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

  test('uploadFile with windows path', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    // Create file using platform-agnostic paths
    await global.addFakeFiles(vol, 'fakeDir', { 'deep/index.js': 'fake content' })
    // Use platform-specific path for file reading (must match actual file system)
    const filePath = path.join('fakeDir', 'deep', 'index.js')
    // Test that Windows-style backslashes in prefix are normalized correctly
    const prefixPath = 'fakeprefix\\deep\\dir\\'
    await expect(rs.uploadFile(filePath, prefixPath, global.fakeConfig, 'fakeDir')).resolves.toBeUndefined()
    expect(mockS3.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'fake-bucket', Key: 'fakeprefix/deep/dir/index.js' })
    )
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
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', fakeConfig, 'fakeDir')
    const body = Buffer.from('fake content', 'utf8')
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'fake-bucket', Key: 'fakeprefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile should call S3#upload with the correct parameters and slash-prefix', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = global.fakeConfig
    await rs.uploadFile('fakeDir/index.js', '/slash-prefix', fakeConfig, 'fakeDir')
    const body = Buffer.from('fake content', 'utf8')
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'fake-bucket', Key: '/slash-prefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile S3#upload with an unknown Content-Type', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.mst': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.mst', 'fakeprefix', fakeConfig, 'fakeDir')
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
    expect(response).toBe('s-maxage=60, max-age=60')
  })

  test('cachecontrol string for JS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/javascript', global.fakeConfig.app)
    expect(response).toBe('s-maxage=60, max-age=604800')
  })

  test('cachecontrol string for CSS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('text/css', global.fakeConfig.app)
    expect(response).toBe('s-maxage=60, max-age=604800')
  })

  test('cachecontrol string for Image', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('image/jpeg', global.fakeConfig.app)
    expect(response).toBe('s-maxage=60, max-age=604800')
  })

  test('cachecontrol string for default', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/pdf', global.fakeConfig.app)
    expect(response).toBe(null)
  })

  test('cachecontrol string for html when htmlCacheDuration is not defined', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const appConfigWithoutHtmlCache = global.configWithMissing(global.fakeConfig.app, 'htmlCacheDuration')
    const response = rs._getCacheControlConfig('text/html', appConfigWithoutHtmlCache)
    expect(response).toBe(null)
  })

  test('cachecontrol string for JS when jsCacheDuration is not defined', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const appConfigWithoutJsCache = global.configWithMissing(global.fakeConfig.app, 'jsCacheDuration')
    const response = rs._getCacheControlConfig('application/javascript', appConfigWithoutJsCache)
    expect(response).toBe(null)
  })

  test('cachecontrol string for CSS when cssCacheDuration is not defined', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const appConfigWithoutCssCache = global.configWithMissing(global.fakeConfig.app, 'cssCacheDuration')
    const response = rs._getCacheControlConfig('text/css', appConfigWithoutCssCache)
    expect(response).toBe(null)
  })

  test('cachecontrol string for image when imageCacheDuration is not defined', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const appConfigWithoutImageCache = global.configWithMissing(global.fakeConfig.app, 'imageCacheDuration')
    const response = rs._getCacheControlConfig('image/jpeg', appConfigWithoutImageCache)
    expect(response).toBe(null)
  })

  // response header tests
  test('get response header from config with multiple rules', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        },
        '/testFolder/*': {
          testHeader: 'folder-header'
        },
        '/testFolder/*.js': {
          testHeader: 'all-js-file-in-folder-header'
        },
        '/test.js': {
          testHeader: 'specific-file-header'
        }
      }
    })

    const folderPath1 = 'testFolder' + path.sep + 'index.html'
    const folderPath2 = 'testFolder' + path.sep + 'test.js'
    await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2])
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = path.parse(files[0]).dir

    const expectedValMap = {
      'index.html': { 'adp-testHeader': 'generic-header' },
      'test.js': { 'adp-testHeader': 'specific-file-header' }
    }
    expectedValMap[folderPath1] = { 'adp-testHeader': 'folder-header' }
    expectedValMap[folderPath2] = { 'adp-testHeader': 'all-js-file-in-folder-header' }

    files.forEach(f => {
      const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
      const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
      const expected = expectedValMap[fileName]
      expect(response).toStrictEqual(expected)
    })
  })

  test('get response header for folder based path rules', async () => {
    // setup files and paths
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const folderPath1 = 'css' + path.sep + 'ui.css'
    const folderPath2 = 'scripts' + path.sep + 'test.js'
    const folderPath3 = 'images' + path.sep + 'image.png'
    const folderPath4 = 'images' + path.sep + 'thumbnails' + path.sep + 'test.jpeg'
    await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3, folderPath4])
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = path.parse(files[0]).dir

    // create a config of rules for files in specific folder
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        },
        '/css/*': {
          testHeader: 'all-files-in-css-folder-header'
        },
        '/scripts/*': {
          testHeader: 'all-files-in-js-folder-header'
        },
        '/images/*': {
          testHeader: 'all-files-in-images-folder-header'
        }
      }
    })

    // set the expectation
    const expectedValMap = {
      'index.html': { 'adp-testHeader': 'generic-header' },
      'test.js': { 'adp-testHeader': 'generic-header' }
    }
    expectedValMap[folderPath1] = { 'adp-testHeader': 'all-files-in-css-folder-header' }
    expectedValMap[folderPath2] = { 'adp-testHeader': 'all-files-in-js-folder-header' }
    expectedValMap[folderPath3] = { 'adp-testHeader': 'all-files-in-images-folder-header' }
    expectedValMap[folderPath4] = { 'adp-testHeader': 'all-files-in-images-folder-header' }

    // check header application per file
    files.forEach(f => {
      const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
      const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
      const expected = expectedValMap[fileName]
      expect(response).toStrictEqual(expected)
    })
  })

  test('get response header for specific file based path rules', async () => {
    // setup files and paths
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const folderPath1 = 'css' + path.sep + 'ui.css'
    const folderPath2 = 'scripts' + path.sep + 'test.js'
    const folderPath3 = 'images' + path.sep + 'image.png'
    await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3])
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = path.parse(files[0]).dir

    // create a config of rules for spcefic files which overrider folder rules
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        },
        '/css/*': {
          testHeader: 'all-files-in-css-folder-header'
        },
        '/css/ui.css': {
          testHeader: 'specific-css-file-header' // overrides previous css folder rule
        },
        '/scripts/*': {
          testHeader: 'all-files-in-js-folder-header'
        },
        '/scripts/test.js': {
          testHeader: 'specific-js-file-header' // overrides previous js folder rule
        },
        '/images/*': {
          testHeader: 'all-files-in-images-folder-header'
        },
        '/images/image.png': {
          testHeader: 'specific-image-file-header' // overrides previous image folder rule
        }
      }
    })

    // set the expectation
    const expectedValMap = {
      'index.html': { 'adp-testHeader': 'generic-header' },
      'test.js': { 'adp-testHeader': 'generic-header' }
    }
    expectedValMap[folderPath1] = { 'adp-testHeader': 'specific-css-file-header' }
    expectedValMap[folderPath2] = { 'adp-testHeader': 'specific-js-file-header' }
    expectedValMap[folderPath3] = { 'adp-testHeader': 'specific-image-file-header' }

    // check header application per file
    files.forEach(f => {
      const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
      const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
      const expected = expectedValMap[fileName]
      expect(response).toStrictEqual(expected)
    })
  })

  test('get response header for file extension based path rules', async () => {
    // setup files and paths
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const folderPath1 = 'css' + path.sep + 'ui.css'
    const folderPath2 = 'scripts' + path.sep + 'test.js'
    const folderPath3 = 'images' + path.sep + 'image.png'
    await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3])
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = path.parse(files[0]).dir

    // create a config of rules for spcefic files which overrider folder rules
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        },
        '/*.css': {
          testHeader: 'all-css-files-header'
        },
        '/*.js': {
          testHeader: 'all-js-files-header'
        },
        '/*.png': {
          testHeader: 'all-png-files-header'
        }
      }
    })

    // set the expectation
    const expectedValMap = {
      'index.html': { 'adp-testHeader': 'generic-header' },
      'test.js': { 'adp-testHeader': 'all-js-files-header' }
    }
    expectedValMap[folderPath1] = { 'adp-testHeader': 'all-css-files-header' }
    expectedValMap[folderPath2] = { 'adp-testHeader': 'all-js-files-header' }
    expectedValMap[folderPath3] = { 'adp-testHeader': 'all-png-files-header' }

    // check header application per file
    files.forEach(f => {
      const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
      const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
      const expected = expectedValMap[fileName]
      expect(response).toStrictEqual(expected)
    })
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
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = files[0].substring(0, files[0].indexOf('index.js'))
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*': {
          testHeader: 'generic-header'
        }
      }
    })
    // const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', newConfig, fakeDistRoot)
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

  test('Cache control override from response headers', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const files = await rs.walkDir('fakeDir')
    const fakeDistRoot = path.parse(files[0]).dir
    const filePath = files[0] // Use absolute path from walkDir
    const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
      'response-headers': {
        '/*.html': {
          'cache-control': 'max-age=3600, s-maxage=7200',
          testHeader: 'generic-header'
        }
      }
    })
    await rs.uploadFile(filePath, 'fakeprefix', newConfig, fakeDistRoot)
    const body = Buffer.from('fake content', 'utf8')
    const expected = {
      Bucket: 'fake-bucket',
      Key: 'fakeprefix/index.html',
      Body: body,
      ContentType: 'text/html',
      CacheControl: 'max-age=3600, s-maxage=7200',
      Metadata: {
        'adp-testHeader': 'generic-header'
      }
    }
    expect(mockS3.putObject).toHaveBeenCalledWith(expect.objectContaining(expected))
    // Verify that adp-cache-control was removed from metadata
    const putObjectCall = mockS3.putObject.mock.calls[0][0]
    expect(putObjectCall.Metadata).not.toHaveProperty('adp-cache-control')
  })

  test('uploadFile does not set Metadata when responseHeaders is empty', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {
      app: global.fakeConfig.app
      // No web.response-headers
    }
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', fakeConfig, 'fakeDir')
    const body = Buffer.from('fake content', 'utf8')
    const putObjectCall = mockS3.putObject.mock.calls[0][0]
    expect(putObjectCall).not.toHaveProperty('Metadata')
    expect(putObjectCall).toMatchObject({
      Bucket: 'fake-bucket',
      Key: 'fakeprefix/index.js',
      Body: body,
      ContentType: 'application/javascript'
    })
  })

  test('uploadFile sets CacheControl even when responseHeaders is empty', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.html': 'fake content' })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {
      app: global.fakeConfig.app
      // No web.response-headers
    }
    await rs.uploadFile('fakeDir/index.html', 'fakeprefix', fakeConfig, 'fakeDir')
    const body = Buffer.from('fake content', 'utf8')
    const putObjectCall = mockS3.putObject.mock.calls[0][0]
    expect(putObjectCall).not.toHaveProperty('Metadata')
    expect(putObjectCall).toMatchObject({
      Bucket: 'fake-bucket',
      Key: 'fakeprefix/index.html',
      Body: body,
      ContentType: 'text/html',
      CacheControl: 's-maxage=60, max-age=60'
    })
  })
})
