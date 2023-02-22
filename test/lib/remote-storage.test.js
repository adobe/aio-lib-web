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

const RemoteStorage = require('../../lib/remote-storage')

const mockS3 = {
  listObjectsV2: jest.fn(),
  deleteObjects: jest.fn(),
  upload: jest.fn()
}

jest.mock('@aws-sdk/client-s3', () => Object({
  S3Client: () => mockS3
}))

function mockS3Function (name, mockedResolvedValue) {
  let mockPromise
  // if mockedResolveValue is a function
  if (typeof mockedResolvedValue === 'function') {
    mockPromise = jest.fn().mockImplementation(mockedResolvedValue)
  } else {
    mockPromise = jest.fn().mockResolvedValueOnce(mockedResolvedValue)
  }
  mockS3[name].mockReturnValue({ promise: mockPromise })
  return { mockFn: mockS3[name], mockPromise } // might be useful to check if the promise function was called.
}

describe('RemoteStorage', () => {
  beforeEach(() => {
    // resets all mock s3 functions
    jest.resetAllMocks()
    // resets the mock fs
    global.cleanFs(vol)
  })

  test('Constructor should throw when missing credentials', async () => {
    const instantiate = () => new RemoteStorage({})
    expect(instantiate.bind(this)).toThrowWithMessageContaining(['required'])
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
    const { mockFn } = mockS3Function('listObjectsV2', { Contents: [] })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect((await rs.folderExists('fakeprefix'))).toBe(false)
    expect(mockFn).toHaveBeenCalledWith({ Prefix: 'fakeprefix' })
  })

  test('folderExists should return true if there are files', async () => {
    mockS3Function('listObjectsV2', { Contents: ['fakeprefix/index.html'] })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect((await rs.folderExists('fakeprefix'))).toBe(true)
  })

  test('emptyFolder should not throw if there are no files', async () => {
    mockS3Function('listObjectsV2', { Contents: [] })
    const rs = new RemoteStorage(global.fakeTVMResponse)
    expect(rs.emptyFolder.bind(rs, 'fakeprefix')).not.toThrow()
  })

  test('emptyFolder should not call S3#deleteObjects if already empty', async () => {
    mockS3Function('listObjectsV2', { Contents: [] })
    const { mockFn: mockDelete } = mockS3Function('deleteObjects', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockDelete).toHaveBeenCalledTimes(0)
  })

  test('emptyFolder should call S3#deleteObjects with correct parameters with one file', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }]
    mockS3Function('listObjectsV2', { Contents: content })
    const { mockFn: mockDelete } = mockS3Function('deleteObjects', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockDelete).toHaveBeenCalledWith({ Delete: { Objects: content } })
  })

  test('emptyFolder should call S3#deleteObjects with correct parameters with multiple files', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }, { Key: 'fakeprefix/index.css' }, { Key: 'fakeprefix/index.css' }]
    mockS3Function('listObjectsV2', { Contents: content })
    const { mockFn: mockDelete } = mockS3Function('deleteObjects', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockDelete).toHaveBeenCalledWith({ Delete: { Objects: content } })
  })

  test('emptyFolder should call S3#deleteObjects multiple time if listObjects is truncated', async () => {
    const content = [{ Key: 'fakeprefix/index.html' }, { Key: 'fakeprefix/index.css' }, { Key: 'fakeprefix/index.js' }]
    let iterations = 2
    mockS3Function('listObjectsV2', () => {
      const res = { Contents: [content[iterations]], IsTruncated: iterations > 0 }
      iterations--
      return res
    })
    const { mockFn: mockDelete } = mockS3Function('deleteObjects', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.emptyFolder('fakeprefix')
    expect(mockDelete).toHaveBeenCalledWith({ Delete: { Objects: [content[0]] } })
    expect(mockDelete).toHaveBeenCalledWith({ Delete: { Objects: [content[1]] } })
    expect(mockDelete).toHaveBeenCalledWith({ Delete: { Objects: [content[2]] } })
  })

  test('uploadFile should call S3#upload with the correct parameters', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const { mockFn: mockUpload } = mockS3Function('upload', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.js', 'fakeprefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ Key: 'fakeprefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile should call S3#upload with the correct parameters and slash-prefix', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.js': 'fake content' })
    const { mockFn: mockUpload } = mockS3Function('upload', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.js', '/slash-prefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ Key: '/slash-prefix/index.js', Body: body, ContentType: 'application/javascript' }))
  })

  test('uploadFile S3#upload with an unknown Content-Type', async () => {
    global.addFakeFiles(vol, 'fakeDir', { 'index.mst': 'fake content' })
    const { mockFn: mockUpload } = mockS3Function('upload', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const fakeConfig = {}
    await rs.uploadFile('fakeDir/index.mst', 'fakeprefix', fakeConfig)
    const body = Buffer.from('fake content', 'utf8')
    expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ Key: 'fakeprefix/index.mst', Body: body }))
    expect(mockUpload.mock.calls[0][0]).not.toHaveProperty('ContentType')
  })

  test('uploadDir should call S3#upload one time per file', async () => {
    await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html'])
    const { mockFn: mockUpload } = mockS3Function('upload', {})
    const rs = new RemoteStorage(global.fakeTVMResponse)
    await rs.uploadDir('fakeDir', 'fakeprefix', global.fakeConfig.creds.cna)
    expect(mockUpload).toHaveBeenCalledTimes(3)
  })

  test('uploadDir should call a callback once per uploaded file', async () => {
    await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html', 'test/i.js'])
    mockS3Function('upload', {})
    const cbMock = jest.fn()
    const rs = new RemoteStorage(global.fakeTVMResponse)

    await rs.uploadDir('fakeDir', 'fakeprefix', global.fakeConfig.cna, cbMock)
    expect(cbMock).toHaveBeenCalledTimes(4)
  })

  test('cachecontrol string for html', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('text/html', global.fakeConfig.cna)
    expect(response).toBe('s-maxage=0, max-age=60')
  })

  test('cachecontrol string for JS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/javascript', global.fakeConfig.cna)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for CSS', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('text/css', global.fakeConfig.cna)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for Image', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('image/jpeg', global.fakeConfig.cna)
    expect(response).toBe('s-maxage=0, max-age=604800')
  })

  test('cachecontrol string for default', async () => {
    const rs = new RemoteStorage(global.fakeTVMResponse)
    const response = rs._getCacheControlConfig('application/pdf', global.fakeConfig.cna)
    expect(response).toBe('s-maxage=0')
  })
})
