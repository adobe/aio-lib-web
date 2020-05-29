<!--
Copyright 2018 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
-->

[![Version](https://img.shields.io/npm/v/@adobe/aio-app-scripts.svg)](https://npmjs.org/package/@adobe/aio-app-scripts)
[![Downloads/week](https://img.shields.io/npm/dw/@adobe/aio-app-scripts.svg)](https://npmjs.org/package/@adobe/aio-app-scripts)
[![Build Status](https://travis-ci.com/adobe/aio-app-scripts.svg?branch=master)](https://travis-ci.com/adobe/aio-app-scripts)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) 
[![Codecov Coverage](https://img.shields.io/codecov/c/github/adobe/aio-app-scripts/master.svg?style=flat-square)](https://codecov.io/gh/adobe/aio-app-scripts/)


# AIO App Scripts

Utility tooling scripts to build, deploy and run Adobe I/O Apps

## Include as a library in your nodejs project

```bash
npm i --save @adobe/aio-app-scripts
```

```js
const appScripts = require('@adobe/aio-app-scripts')({
  listeners: {
    onStart: taskName => console.error(`${taskName} ...`),
    onEnd: (taskName, res) => { console.error(`${taskName} done!`); if (res) console.log(res) },
    onWarning: warning => console.error(warning),
    onProgress: item => console.error(`  > ${item}`)
  }
})

appScripts.buildUI()
  .then(appScripts.buildActions)
  .then(appScripts.deployActions)
  .then(appScripts.deployUI)
  .catch(e => { console.error(e); process.exit(1) })
```

## Explore

- `goto` [API](doc/api.md)

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
