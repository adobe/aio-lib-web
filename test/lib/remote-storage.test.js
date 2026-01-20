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

    test('should call PUT /files with slash-prefix', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockResolvedValue(mockResponse({ success: true }))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await rs.uploadFile('fakeDir/index.js', '/slash-prefix', appConfig, 'fakeDir')

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.name).toBe('/slash-prefix/index.js')
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

      await expect(
        rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')
      ).rejects.toThrow('Failed to upload file: Internal Server Error')
    })

    test('should throw if fetch itself throws (network error)', async () => {
      global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
      global.fetch.mockRejectedValue(new Error('Network error'))
      const rs = new RemoteStorage(global.fakeAuthToken)
      const appConfig = createAppConfig()

      await expect(
        rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir')
      ).rejects.toThrow('Network error')
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
  })

  describe('_urlJoin', () => {
    test('joins paths without leading slash', () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const result = rs._urlJoin('path', 'to', 'file')
      expect(result).toBe('path/to/file')
    })

    test('preserves leading slash when first arg starts with /', () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const result = rs._urlJoin('/leading', 'path', 'file')
      expect(result).toBe('/leading/path/file')
    })

    test('handles empty strings and nulls', () => {
      const rs = new RemoteStorage(global.fakeAuthToken)
      const result = rs._urlJoin('path', '', null, 'file')
      expect(result).toBe('path/file')
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

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', newConfig, fakeDistRoot, global.fakeAuthToken)

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

      await rs.uploadFile(filePath, 'fakeprefix', newConfig, fakeDistRoot, global.fakeAuthToken)

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

      await rs.uploadFile('fakeDir/index.js', 'fakeprefix', appConfig, 'fakeDir', global.fakeAuthToken)

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

      await rs.uploadFile('fakeDir/index.html', 'fakeprefix', appConfig, 'fakeDir', global.fakeAuthToken)

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.file.cacheControl).toBe('s-maxage=60, max-age=60')
      expect(body.file.customHeaders).toEqual({})
    })
  })
})
