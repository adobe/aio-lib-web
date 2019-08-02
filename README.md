# CNA Scripts

The module implementing the Adobe I/O CNA scripts

## Include as a library in your nodejs project

```bash
npm i --save @adobe/io-cna-scripts
```

```js
const cnaScripts = require('@adobe/io-cna-scripts')({
  listeners: {
    onStart: taskName => console.error(`${taskName} ...`),
    onEnd: (taskName, res) => { console.error(`${taskName} done!`); if (res) console.log(res) },
    onWarning: warning => console.error(warning),
    onProgress: item => console.error(`  > ${item}`)
  }
})

cnaScripts.buildUI()
  .then(cnaScripts.buildActions)
  .then(cnaScripts.deployActions)
  .then(cnaScripts.deployUI)
  .catch(e => { console.error(e); process.exit(1) })
```

## Install globally to run directly
_note this interface is experimental and may disappear in the future_

```bash
npm i -g @adobe/io-cna-scripts
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

## Using cna-scripts for local dev

> **Requires docker!**

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

> **Requires wskdebug which is not yet publicly available!**

- Actions can be debugged in both with local dev and remote actions dev modes

- Simply start the dev server `cna-scripts dev`, this will generate all needed
  vscode debug configurations

- Then start the vs code debugger from the configuration you want, i.e. choose
  `WebAndActions` to debug all actions and UI simultaneously or choose separate
  debuggers.

- When you stop the dev server all vs code configurations are cleaned up and
  restored.

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
