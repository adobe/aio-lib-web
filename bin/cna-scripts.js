#!/usr/bin/env node
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
const spawn = require('cross-spawn')
const fs = require('fs')
const args = process.argv.slice(2)

if (!args[0]) throw new Error('Missing script name, usage cna-scripts <script-name> <script-args>')

const scriptDir = path.join(__dirname, '..', 'scripts')
const scriptName = args[0]
const script = path.join(scriptDir, scriptName + '.js')

if (!fs.existsSync(script)) throw new Error(`script '${scriptName}' is not supported, choose one of: ${fs.readdirSync(scriptDir).map(f => path.parse(f).name).join(', ')}`)

const res = spawn.sync(script, args.slice(1), { stdio: 'inherit' })
if (res.error) throw res.error
process.exit(res.status)
