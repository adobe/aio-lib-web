
      const includeFiles = []
      if (action.include) {
        // include is array of [ src, dest ]
        const files = await Promise.all(action.include.map(async elem => {
          if (elem.length === 0) {
            throw new Error('Invalid manifest `include` entry: Empty')
          } else if (elem.length === 1) {

          } else if (elem.length === 2) {

          } else {
            throw new Error('Invalid manifest `include` entry: ' + elem.toString())
          }

          const pair = {}
          pair.dest = elem[1]
          pair.sources = await utils.getMatchingFileList(elem[0])
          return pair
        }))
        // const flatted = arr => [].concat(...arr)
        // console.log('flatted(files) = ', flatted(files))
        includeFiles.push(...files)
      }


        const outBuildFilename = 'index.js' // `${name}.tmp.js`
        const outBuildDir = path.join(path.dirname(outPath), 'temp') // build all to tempDir first


              // zip the bundled file
        // the path in zip must be renamed to index.js even if buildFilename is not index.js
        const zipSrcPath = path.join(outBuildDir, outBuildFilename)
        console.log('\nzipSrcPath:', zipSrcPath)
        console.log('outBuildDir:', outBuildDir)
        console.log('outBuildFilename:', outBuildFilename)
        console.log('actionPath = ', actionPath)
        // copy over our 'include' files
        // see https://github.com/apache/openwhisk-wskdeploy/blob/cbe7c52d99c1ead5172946d3aeb33adb5d5c40b2/utils/zip.go#L115
        // if "destination" is not specified, its considered same as "source"
        // "source" is relative to where manifest.yaml file is located
        // relative source path is converted to absolute path by appending manifest path
        // since the relative source path might not be accessible from where wskdeploy is invoked
        // "destination" is relative to the action directory, the one specified in function
        // relative path is converted to absolute path by appending function directory
    
        includeFiles.forEach(incFile => {
          console.log('copying : ', incFile)
          const dest = path.join(outBuildDir, incFile.dest)
          incFile.sources.forEach(file => {
              const fDesc = path.parse(dest)
              console.log('fDesc : ', fDesc)
           // fs.copyFileSync(incFile, path.join(outBuildDir, path.parse(incFile).base))
          })
          
        })