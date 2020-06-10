const path = require('path')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-app-scripts:owlocal', { provider: 'debug' })
const execa = require('execa')

const OW_LOCAL_DOCKER_PORT = 3233

function isWindowsOrMac () {
  return (
    process.platform === 'win32' ||
    process.platform === 'darwin'
  )
}

function getDockerNetworkAddress () {
  try {
    // Docker for Windows and macOS do not allow routing to the containers via
    // IP address, only port forwarding is allowed
    if (!isWindowsOrMac()) {
      const args = ['network', 'inspect', 'bridge']
      const result = execa.sync('docker', args)
      const json = JSON.parse(result.stdout)
      return `http://${json[0].IPAM.Config[0].Gateway}:${OW_LOCAL_DOCKER_PORT}`
    }
  } catch (error) {
    aioLogger.debug(`getDockerNetworkAddress ${error}`)
  }

  return `http://localhost:${OW_LOCAL_DOCKER_PORT}`
}

// gets these values if the keys are set in the environment, if not it will use the defaults set
const {
  // TODO: this jar should become part of the distro, OR it should be pulled from bintray or similar.
  OW_JAR_URL = 'https://github.com/adobe/aio-app-scripts/raw/binaries/bin/openwhisk-standalone-0.10.jar',
  // This path will be relative to this module, and not the cwd, so multiple projects can use it.
  OW_JAR_FILE = path.resolve(__dirname, '../bin/openwhisk-standalone.jar'),
  OW_LOCAL_APIHOST = getDockerNetworkAddress(),
  OW_LOCAL_NAMESPACE = 'guest',
  OW_LOCAL_AUTH = '23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP'
} = process.env

module.exports = {
  getDockerNetworkAddress,
  OW_LOCAL_DOCKER_PORT,
  OW_JAR_URL,
  OW_JAR_FILE,
  OW_LOCAL_APIHOST,
  OW_LOCAL_NAMESPACE,
  OW_LOCAL_AUTH
}
