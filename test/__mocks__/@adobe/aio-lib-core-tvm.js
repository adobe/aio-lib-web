const mockTvm = {
  init: jest.fn(async () => {
    return {
      getAwsS3Credentials: jest.fn(async () => {
        return { fake: 'tvmcreds' }
      })
    }
  })
}

module.exports = mockTvm
