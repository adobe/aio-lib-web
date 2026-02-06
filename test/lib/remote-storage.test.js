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

const { vol } = global.mockFs()
const path = require('path')

const RemoteStorage = require('../../lib/remote-storage')

// Mock fetch globally
global.fetch = jest.fn()

// Helper to create a mock response
const mockResponse = (body, options = {}) => ({
  ok: options.ok !== false,
  status: options.status || 200,
  statusText: options.statusText || 'OK',
  json: jest.fn().mockResolvedValue(body)
})

// Helper to create appConfig (auth token now passed to constructor, not in config)
const createAppConfig = (overrides = {}) => ({
  ow: {
    namespace: global.fakeNamespace
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
  },
  ...overrides
})

describe('RemoteStorage', () => {
  beforeEach(() => {
    // resets the mock fs
    global.cleanFs(vol)
    // reset fetch mock
    global.fetch.mockReset()
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
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })

    test('Constructor uses https_proxy when set (lowercase)', async () => {
      process.env.https_proxy = 'http://proxy.example.com:3128'
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })

    test('Constructor uses HTTP_PROXY when HTTPS_PROXY not set', async () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080'
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })

    test('Constructor uses http_proxy when other proxy vars not set', async () => {
      process.env.http_proxy = 'http://proxy.example.com:3128'
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })

    test('Constructor prioritizes HTTPS_PROXY over HTTP_PROXY', async () => {
      process.env.HTTPS_PROXY = 'http://https-proxy.example.com:8080'
      process.env.HTTP_PROXY = 'http://http-proxy.example.com:8080'
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })

    test('Constructor prioritizes https_proxy over HTTP_PROXY', async () => {
      process.env.https_proxy = 'http://https-proxy.example.com:3128'
      process.env.HTTP_PROXY = 'http://http-proxy.example.com:8080'
      const rs = new RemoteStorage(global.fakeAuthToken)
      expect(rs).toBeDefined()
    })
  })

  describe('folderExists', () => {
    test('missing prefix should throw', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      await expect(rs.folderExists(undefined, appConfig)).rejects.toEqual(
        expect.objectContaining({ message: 'prefix must be a valid string' })
      )
    })

    test('should return false if there are no files', async () => {
      global.fetch.mockResolvedValue(mockResponse([]))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const result = await rs.folderExists('fakeprefix', appConfig)

      expect(result).toBe(false)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/cdn-api/namespaces/${global.fakeNamespace}/files`),
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: global.fakeAuthToken }
        })
      )
    })

    test('should return true if there are files', async () => {
      global.fetch.mockResolvedValue(mockResponse([{ key: 'file1.txt' }]))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const result = await rs.folderExists('fakeprefix', appConfig)

      expect(result).toBe(true)
    })

    test('should return false if request fails', async () => {
      global.fetch.mockResolvedValue(mockResponse(null, { ok: false, status: 500 }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      const result = await rs.folderExists('fakeprefix', appConfig)
      expect(result).toBe(false)
    })

    test('should throw if no auth token', async () => {
      const rs = new RemoteStorage(null)
      const appConfig = createAppConfig()
      await expect(rs.folderExists('fakeprefix', appConfig)).rejects.toThrow(
        'cannot check if folder exists, Authorization is required'
      )
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

  test('uploadFile with windows path', async () => {
    global.fetch.mockResolvedValue(mockResponse({ success: true }))
    const rs = new RemoteStorage(global.fakeAuthToken)
    const appConfig = createAppConfig()
    // Create file using platform-agnostic paths
    await global.addFakeFiles(vol, 'fakeDir', { 'deep/index.js': 'fake content' })
    // Use platform-specific path for file reading (must match actual file system)
    const filePath = path.join('fakeDir', 'deep', 'index.js')
    // Test that Windows-style backslashes in prefix are normalized correctly
    const prefixPath = 'fakeprefix\\deep\\dir\\'
    await rs.uploadFile(filePath, prefixPath, appConfig, 'fakeDir')

    const callArgs = global.fetch.mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    // Backslashes should be normalized to forward slashes in the file name
    expect(body.file.name).toBe('fakeprefix/deep/dir/index.js')
  })

  test('uploadDir missing basePath', async () => {
    const rs = new RemoteStorage(global.fakeAuthToken)
    await expect(rs.uploadDir()).rejects.toEqual(expect.objectContaining({ message: 'basePath must be a valid string' }))
  })

  describe('emptyFolder', () => {
    test('missing prefix should throw', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      await expect(rs.emptyFolder(undefined, appConfig)).rejects.toEqual(
        expect.objectContaining({ message: 'prefix must be a valid string' })
      )
    })

    test('should call DELETE /files/ when prefix is "/"', async () => {
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const result = await rs.emptyFolder('/', appConfig)

      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/cdn-api/namespaces/${global.fakeNamespace}/files/`),
        expect.objectContaining({
          method: 'DELETE',
          headers: { Authorization: global.fakeAuthToken }
        })
      )
    })

    test('should call DELETE /files/:key for specific file', async () => {
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const result = await rs.emptyFolder('path/to/file.txt', appConfig)

      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/cdn-api/namespaces/${global.fakeNamespace}/files/path/to/file.txt`),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    test('should return false if delete fails', async () => {
      global.fetch.mockResolvedValue(mockResponse(null, { ok: false, status: 500 }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const result = await rs.emptyFolder('/', appConfig)

      expect(result).toBe(false)
    })

    test('should throw if no auth token', async () => {
      const rs = new RemoteStorage(null)
      const appConfig = createAppConfig()

      await expect(rs.emptyFolder('/', appConfig)).rejects.toThrow(
        'cannot empty folder, Authorization is required'
      )
    })
  })

  describe('uploadFile', () => {
    test('missing filePath should throw', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      await expect(rs.uploadFile('file.txt', undefined, appConfig, 'dist')).rejects.toEqual(
        expect.objectContaining({ message: 'filePath must be a valid string' })
      )
    })

    test('should call PUT /files with correct parameters', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/cdn-api/namespaces/${global.fakeNamespace}/files`),
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: global.fakeAuthToken
          }
        })
      )

      // Verify the body contains expected data
      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file).toMatchObject({
        name: 'fakeprefix/index.js',
        contentType: 'application/javascript'
      })
      expect(body.file.content).toBeDefined() // base64 encoded content
    })

    test('should call PUT /files without slash-prefix', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadFile('fakeDir/index.js', '/slash-prefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.name).toBe('slash-prefix/index.js')
    })

    test('should strip namespace from filePath if present', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      // filePath contains namespace which gets stripped, leaving a leading slash
      await rs.uploadFile('fakeDir/index.js', `${global.fakeNamespace}/subpath`, appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      // namespace is stripped and leading slash is removed
      expect(body.file.name).toBe('subpath/index.js')
    })

    test('should handle unknown Content-Type', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.mst': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadFile('fakeDir/index.mst', 'fakeprefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.name).toBe('fakeprefix/index.mst')
      // contentType will be false for unknown extensions
      expect(body.file.contentType).toBe(false)
    })

    test('should handle empty filePath (file at root)', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadFile('fakeDir/index.js', '', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      // When filePath is empty, file.name should just be the filename
      expect(body.file.name).toBe('index.js')
    })

    test('should throw if upload fails', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')
      ).rejects.toThrow('Failed to upload file: Internal Server Error')

      expect(consoleSpy).toHaveBeenCalledWith('Failed to upload file:', 'fakeDir/index.js')
      consoleSpy.mockRestore()
    })

    test('should throw if fetch itself throws (network error)', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockRejectedValue(new Error('Network error'))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')
      ).rejects.toThrow('Network error')

      expect(consoleSpy).toHaveBeenCalledWith('Error uploading file:', 'fakeDir/index.js')
      consoleSpy.mockRestore()
    })
  })

  describe('uploadDir', () => {
    test('missing basePath should throw', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      await expect(rs.uploadDir('fakeDir', undefined, appConfig)).rejects.toEqual(
        expect.objectContaining({ message: 'basePath must be a valid string' })
      )
    })

    test('should upload all files in directory', async () => {
      global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html'])
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadDir('fakeDir', 'fakeprefix', appConfig)

      // Should have called fetch for each file
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    test('should call callback once per uploaded file', async () => {
      global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html', 'test/i.js'])
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const cbMock = jest.fn()
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadDir('fakeDir', 'fakeprefix', appConfig, cbMock)

      expect(cbMock).toHaveBeenCalledTimes(4)
    })

    test('should throw if no auth token', async () => {
      global.addFakeFiles(vol, 'fakeDir', ['index.js'])
      const rs = new RemoteStorage(null)
      const appConfig = createAppConfig()

      await expect(rs.uploadDir('fakeDir', 'fakeprefix', appConfig)).rejects.toThrow(
        'cannot upload files, Authorization is required'
      )
    })

    test('should return upload results in batches', async () => {
      global.addFakeFiles(vol, 'fakeDir', ['file1.js', 'file2.js', 'file3.js'])
      global.fetch.mockResolvedValue(mockResponse({ success: true }, { status: 200 }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      const results = await rs.uploadDir('fakeDir', 'fakeprefix', appConfig)

      // Results should be an array of batches, each batch containing upload status codes
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      // Each batch result should contain status codes (200)
      expect(results[0]).toEqual([200, 200, 200])
    })

    test('should call callback with file path for each uploaded file', async () => {
      global.addFakeFiles(vol, 'fakeDir', ['file1.js', 'file2.js'])
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const cbMock = jest.fn()
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadDir('fakeDir', 'fakeprefix', appConfig, cbMock)

      // Callback should receive the file path
      expect(cbMock).toHaveBeenCalledTimes(2)
      cbMock.mock.calls.forEach(call => {
        expect(call[0]).toMatch(/fakeDir/)
      })
    })
  })

  describe('cache control', () => {
    test('cachecontrol string for html', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const response = rs._getCacheControlConfig('text/html', global.fakeConfig.app)
      expect(response).toBe('s-maxage=60, max-age=60')
    })

    test('cachecontrol string for JS', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const response = rs._getCacheControlConfig('application/javascript', global.fakeConfig.app)
      expect(response).toBe('s-maxage=60, max-age=604800')
    })

    test('cachecontrol string for CSS', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const response = rs._getCacheControlConfig('text/css', global.fakeConfig.app)
      expect(response).toBe('s-maxage=60, max-age=604800')
    })

    test('cachecontrol string for Image', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const response = rs._getCacheControlConfig('image/jpeg', global.fakeConfig.app)
      expect(response).toBe('s-maxage=60, max-age=604800')
    })

    test('cachecontrol string for default', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const response = rs._getCacheControlConfig('application/pdf', global.fakeConfig.app)
      expect(response).toBe(null)
    })

    test('cachecontrol string for html when htmlCacheDuration is not defined', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfigWithoutHtmlCache = global.configWithMissing(global.fakeConfig.app, 'htmlCacheDuration')
      const response = rs._getCacheControlConfig('text/html', appConfigWithoutHtmlCache)
      expect(response).toBe(null)
    })

    test('cachecontrol string for JS when jsCacheDuration is not defined', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfigWithoutJsCache = global.configWithMissing(global.fakeConfig.app, 'jsCacheDuration')
      const response = rs._getCacheControlConfig('application/javascript', appConfigWithoutJsCache)
      expect(response).toBe(null)
    })

    test('cachecontrol string for CSS when cssCacheDuration is not defined', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfigWithoutCssCache = global.configWithMissing(global.fakeConfig.app, 'cssCacheDuration')
      const response = rs._getCacheControlConfig('text/css', appConfigWithoutCssCache)
      expect(response).toBe(null)
    })

    test('cachecontrol string for image when imageCacheDuration is not defined', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfigWithoutImageCache = global.configWithMissing(global.fakeConfig.app, 'imageCacheDuration')
      const response = rs._getCacheControlConfig('image/jpeg', appConfigWithoutImageCache)
      expect(response).toBe(null)
    })
  })

  describe('response headers', () => {
    test('get response header from config with multiple rules', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
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
      const rs = new RemoteStorage(global.fakeAuthToken)
      const folderPath1 = 'css' + path.sep + 'ui.css'
      const folderPath2 = 'scripts' + path.sep + 'test.js'
      const folderPath3 = 'images' + path.sep + 'image.png'
      const folderPath4 = 'images' + path.sep + 'thumbnails' + path.sep + 'test.jpeg'
      await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3, folderPath4])
      const files = await rs.walkDir('fakeDir')
      const fakeDistRoot = path.parse(files[0]).dir

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

      const expectedValMap = {
        'index.html': { 'adp-testHeader': 'generic-header' },
        'test.js': { 'adp-testHeader': 'generic-header' }
      }
      expectedValMap[folderPath1] = { 'adp-testHeader': 'all-files-in-css-folder-header' }
      expectedValMap[folderPath2] = { 'adp-testHeader': 'all-files-in-js-folder-header' }
      expectedValMap[folderPath3] = { 'adp-testHeader': 'all-files-in-images-folder-header' }
      expectedValMap[folderPath4] = { 'adp-testHeader': 'all-files-in-images-folder-header' }

      files.forEach(f => {
        const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
        const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
        const expected = expectedValMap[fileName]
        expect(response).toStrictEqual(expected)
      })
    })

    test('get response header for specific file based path rules', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const folderPath1 = 'css' + path.sep + 'ui.css'
      const folderPath2 = 'scripts' + path.sep + 'test.js'
      const folderPath3 = 'images' + path.sep + 'image.png'
      await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3])
      const files = await rs.walkDir('fakeDir')
      const fakeDistRoot = path.parse(files[0]).dir

      const newConfig = global.configWithModifiedWeb(global.fakeConfig, {
        'response-headers': {
          '/*': {
            testHeader: 'generic-header'
          },
          '/css/*': {
            testHeader: 'all-files-in-css-folder-header'
          },
          '/css/ui.css': {
            testHeader: 'specific-css-file-header'
          },
          '/scripts/*': {
            testHeader: 'all-files-in-js-folder-header'
          },
          '/scripts/test.js': {
            testHeader: 'specific-js-file-header'
          },
          '/images/*': {
            testHeader: 'all-files-in-images-folder-header'
          },
          '/images/image.png': {
            testHeader: 'specific-image-file-header'
          }
        }
      })

      const expectedValMap = {
        'index.html': { 'adp-testHeader': 'generic-header' },
        'test.js': { 'adp-testHeader': 'generic-header' }
      }
      expectedValMap[folderPath1] = { 'adp-testHeader': 'specific-css-file-header' }
      expectedValMap[folderPath2] = { 'adp-testHeader': 'specific-js-file-header' }
      expectedValMap[folderPath3] = { 'adp-testHeader': 'specific-image-file-header' }

      files.forEach(f => {
        const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
        const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
        const expected = expectedValMap[fileName]
        expect(response).toStrictEqual(expected)
      })
    })

    test('get response header for file extension based path rules', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const folderPath1 = 'css' + path.sep + 'ui.css'
      const folderPath2 = 'scripts' + path.sep + 'test.js'
      const folderPath3 = 'images' + path.sep + 'image.png'
      await global.addFakeFiles(vol, 'fakeDir', ['index.html', 'test.js', folderPath1, folderPath2, folderPath3])
      const files = await rs.walkDir('fakeDir')
      const fakeDistRoot = path.parse(files[0]).dir

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

      const expectedValMap = {
        'index.html': { 'adp-testHeader': 'generic-header' },
        'test.js': { 'adp-testHeader': 'all-js-files-header' }
      }
      expectedValMap[folderPath1] = { 'adp-testHeader': 'all-css-files-header' }
      expectedValMap[folderPath2] = { 'adp-testHeader': 'all-js-files-header' }
      expectedValMap[folderPath3] = { 'adp-testHeader': 'all-png-files-header' }

      files.forEach(f => {
        const fileName = f.replace(path.join(fakeDistRoot, path.sep), '')
        const response = rs.getResponseHeadersForFile(f, fakeDistRoot, newConfig)
        const expected = expectedValMap[fileName]
        expect(response).toStrictEqual(expected)
      })
    })

    test('get response header with invalid header name', async () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
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
      const rs = new RemoteStorage(global.fakeAuthToken)
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
  })

  describe('uploadFile with response headers', () => {
    test('includes response headers in upload request', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const files = await rs.walkDir('fakeDir')
      const fakeDistRoot = files[0].substring(0, files[0].indexOf('index.js'))
      const newConfig = global.configWithModifiedWeb(createAppConfig(), {
        'response-headers': {
          '/*': {
            testHeader: 'generic-header'
          }
        }
      })

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', newConfig, fakeDistRoot)

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.customHeaders).toMatchObject({
        'adp-testHeader': 'generic-header'
      })
    })

    test('cache control override from response headers', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.html': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const files = await rs.walkDir('fakeDir')
      const fakeDistRoot = path.parse(files[0]).dir
      const filePath = files[0]
      const newConfig = global.configWithModifiedWeb(createAppConfig(), {
        'response-headers': {
          '/*.html': {
            'cache-control': 'max-age=3600, s-maxage=7200',
            testHeader: 'generic-header'
          }
        }
      })

      await rs.uploadFile(filePath, 'fakeprefix', newConfig, fakeDistRoot)

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      // cache-control from response-headers should override the computed cacheControl
      expect(body.file.cacheControl).toBe('max-age=3600, s-maxage=7200')
      // adp-cache-control should be removed from customHeaders
      expect(body.file.customHeaders).not.toHaveProperty('adp-cache-control')
      expect(body.file.customHeaders).toMatchObject({
        'adp-testHeader': 'generic-header'
      })
    })

    test('does not set customHeaders when responseHeaders is empty', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      delete appConfig.web // No web.response-headers

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      // When no response-headers config, getResponseHeadersForFile returns undefined
      // which becomes {} after the ?? {} fallback
      expect(body.file.customHeaders).toEqual({})
    })

    test('sets cacheControl even when responseHeaders is empty', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.html': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      delete appConfig.web // No web.response-headers

      await rs.uploadFile('fakeDir/index.html', 'fakeprefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.cacheControl).toBe('s-maxage=60, max-age=60')
      expect(body.file.customHeaders).toEqual({})
    })

    test('uploadFile does not set customHeaders when responseHeaders is empty', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()
      delete appConfig.web // No web.response-headers

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.customHeaders).toEqual({})
      expect(body.file.name).toBe('fakeprefix/index.js')
      expect(body.file.contentType).toBe('application/javascript')
    })
  })
})

describe('RemoteStorage environment URL selection', () => {
  // The deploymentServiceUrl is computed at module load time, so we need to
  // reset modules and set up mocks BEFORE requiring remote-storage

  beforeEach(() => {
    jest.resetModules()
    global.fetch.mockReset()
  })

  test('uses stage url when in stage environment', async () => {
    // Set up mock BEFORE requiring the module
    jest.doMock('@adobe/aio-lib-env', () => ({
      getCliEnv: jest.fn(() => 'stage'),
      PROD_ENV: 'prod',
      STAGE_ENV: 'stage'
    }))

    // Now require the module fresh with the mock in place
    const RemoteStorageFresh = require('../../lib/remote-storage')

    global.fetch.mockResolvedValue(mockResponse([]))
    const rs = new RemoteStorageFresh(global.fakeAuthToken)

    await rs.folderExists('fakeprefix', createAppConfig())

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://deploy-service.stg.app-builder.corp.adp.adobe.io'),
      expect.any(Object)
    )
  })

  test('uses prod url when in prod environment', async () => {
    // Set up mock for prod environment
    jest.doMock('@adobe/aio-lib-env', () => ({
      getCliEnv: jest.fn(() => 'prod'),
      PROD_ENV: 'prod',
      STAGE_ENV: 'stage'
    }))

    // Now require the module fresh with the mock in place
    const RemoteStorageFresh = require('../../lib/remote-storage')

    global.fetch.mockResolvedValue(mockResponse([]))
    const rs = new RemoteStorageFresh(global.fakeAuthToken)

    await rs.folderExists('fakeprefix', createAppConfig())

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://deploy-service.app-builder.adp.adobe.io'),
      expect.any(Object)
    )
  })
})
