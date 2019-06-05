const fs = require('fs-extra')
const path = require('path')

class MockBundler {
  constructor (infile, options) {
    this.infile = infile
    this.outDir = options.outDir
  }
  async bundle () {
    await fs.copy(this.infile, path.join(this.outDir, path.basename(this.infile)))
  }
}
// todo jest.fn
module.exports = MockBundler
