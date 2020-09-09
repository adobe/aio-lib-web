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

const AppScripts = require('../index')

describe('AppScripts has expected interface ', () => {
  test('exports functions', async () => {
    expect(AppScripts.buildWeb).toBeDefined()
    expect(typeof AppScripts.buildWeb).toBe('function')

    expect(AppScripts.deployWeb).toBeDefined()
    expect(typeof AppScripts.deployWeb).toBe('function')

    expect(AppScripts.undeployWeb).toBeDefined()
    expect(typeof AppScripts.undeployWeb).toBe('function')
  })

  test('requires config.app to be passed', async () => {
    await expect(AppScripts.buildWeb()).rejects.toThrow('cannot build web')
    await expect(AppScripts.buildWeb({})).rejects.toThrow('cannot build web')

    await expect(AppScripts.deployWeb()).rejects.toThrow('cannot deploy web')
    await expect(AppScripts.deployWeb({})).rejects.toThrow('cannot deploy web')

    await expect(AppScripts.undeployWeb()).rejects.toThrow('cannot undeploy web')
    await expect(AppScripts.undeployWeb({})).rejects.toThrow('cannot undeploy web')
  })
})
