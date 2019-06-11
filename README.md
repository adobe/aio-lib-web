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
cna-scripts build.actions <appDir>
cna-scripts build.ui <appDir>
cna-scripts deploy.actions <appDir>
cna-scripts deploy.ui <appDir>
cna-scripts undeploy.actions <appDir>
cna-scripts undeploy.ui <appDir>
```

## Run from JS

```js
if (process.argv[2]) process.chdir(process.argv[2])

const scripts = require('@adobe/io-cna-scripts')({
  listeners: {
    onStart: taskName => console.log(`${taskName} ...`),
    onEnd: taskName => console.log(`${taskName} done!`),
    onWarning: warning => console.warn(warning),
    onProgress: item => console.log(`  > ${item}`)
  }
})

scripts.buildUI()
  .then(scripts.buildActions)
  .then(scripts.deployActions)
  .then(scripts.deployUI)
  .then(url => require('open')(url))
  .catch(e => { console.error(e); process.exit(1) })
```

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
