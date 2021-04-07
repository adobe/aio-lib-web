/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const TvmClient = require('@adobe/aio-lib-core-tvm')

const getS3Credentials = async (config) => {
  if (
    // byo
    !(config.s3 && config.s3.creds) &&
    // ootb
    !(config.ow && config.ow.namespace && config.ow.auth)
  ) {
    throw new Error('Please check your .env file to ensure your credentials are correct. You can also use "aio app use" to load/refresh your credentials')
  }

  if (config.s3 && config.s3.creds) {
    return config.s3.creds
  }

  const client = await TvmClient.init({
    ow: {
      namespace: config.ow.namespace,
      auth: config.ow.auth
    },
    // can be undefined => defaults in TvmClient
    apiUrl: config.s3 && config.s3.tvmUrl,
    cacheFile: config.s3 && config.s3.credsCacheFile
  })

  const creds = await client.getAwsS3Credentials()
  return creds
}

module.exports = getS3Credentials
