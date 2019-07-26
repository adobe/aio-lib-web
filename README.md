# CNA Scripts

The module implementing the Adobe I/O CNA scripts

## Setup

```bash
npm i @adobe/io-cna-scripts
```

## Run from cmdline

Add binary to path:

```bash
export PATH="$PATH":"$PWD"/node_modules/.bin
```

Commands:

```bash
cna-scripts build.actions
cna-scripts build.ui
cna-scripts deploy.actions
cna-scripts deploy.ui
cna-scripts undeploy.actions
cna-scripts undeploy.ui
```

## Run from JS

```js
const scripts = require('@adobe/io-cna-scripts')({
  listeners: {
    onStart: taskName => console.error(`${taskName} ...`),
    onEnd: (taskName, res) => { console.error(`${taskName} done!`); if (res) console.log(res) },
    onWarning: warning => console.error(warning),
    onProgress: item => console.error(`  > ${item}`)
  }
})

scripts.buildUI()
  .then(scripts.buildActions)
  .then(scripts.deployActions)
  .then(scripts.deployUI)
  .catch(e => { console.error(e); process.exit(1) })
```

## Local Dev

**Requires docker!**

- run dev server, this will spin up a local OpenWhisk stack and run a small
  express server for the frontend

```bash
   cna-scripts dev
```

- only run frontend server, the frontend will point to remotely deployed actions

```bash
   REMOTE_ACTIONS=true cna-scripts dev
```

### Debugging with VS Code

**Requires wskdebug, add instructions on how to install!**

- Actions can be debugged in both with local dev and remote actions dev modes

- Simply start the dev server `cna-scripts dev`, this will generate all needed
  vscode debug configurations

- Then start the vs code debugger from the configuration you want, i.e. choose
  `WebAndActions` to debug all actions and UI simultaneously or choose separate
  debuggers.

- When you stop the dev server all vs code configurations are cleaned up and
  restored.

### TODO

- from poc to dev cmd:
  - code cleanup
  - unit tests
  - make sure dependencies are released (e.g `aio-cli-config`)
  - better doc
  - aio cna dev command
  - auto download `wskdebug` (as dependencies) and `openwhisk-standalone.jar`
  - windows support (e.g sigint, standalone jar, wskdebug,...)
  - make sure action dependencies are available while debugging from source file
- vscode plugin

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
