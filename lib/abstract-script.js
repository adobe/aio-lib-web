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
const EventEmitter = require('events')

module.exports = class CNAScript extends EventEmitter {
  constructor (config) {
    super()
    if (typeof config !== 'object') {
      throw new Error(`config is not a valid object, received ${(typeof config)}`)
    }
    this.config = config
  }

  /** Interface methods */
  async run () {
    throw new Error('Not implemented')
  }

  /** Instance utilities */
  _relApp (p) {
    return path.relative(this.config.root, path.normalize(p))
  }

  _absApp (p) {
    return path.join(this.config.root, path.normalize(p))
  }
}
