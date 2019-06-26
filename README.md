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

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
