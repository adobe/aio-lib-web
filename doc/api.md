<a name="module_adobe/aio-app-scripts"></a>

## adobe/aio-app-scripts
Adobe I/O application scripts


* [adobe/aio-app-scripts](#module_adobe/aio-app-scripts)
    * [module.exports([options])](#exp_module_adobe/aio-app-scripts--module.exports) ⇒ <code>AppScripts</code> ⏏
        * [~AppScripts](#module_adobe/aio-app-scripts--module.exports..AppScripts) : <code>object</code>

<a name="exp_module_adobe/aio-app-scripts--module.exports"></a>

### module.exports([options]) ⇒ <code>AppScripts</code> ⏏
Returns application scripts functions

**Kind**: Exported function  
**Returns**: <code>AppScripts</code> - With all script functions  

| Param | Type |
| --- | --- |
| [options] | <code>object</code> | 
| [options.listeners] | <code>object</code> | 
| [options.listeners.onStart] | <code>function</code> | 
| [options.listeners.onEnd] | <code>function</code> | 
| [options.listeners.onProgress] | <code>function</code> | 
| [options.listeners.onResource] | <code>function</code> | 
| [options.listeners.onWarning] | <code>function</code> | 

<a name="module_adobe/aio-app-scripts--module.exports..AppScripts"></a>

#### module.exports~AppScripts : <code>object</code>
**Kind**: inner typedef of [<code>module.exports</code>](#exp_module_adobe/aio-app-scripts--module.exports)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| buildUI | <code>function</code> | bundles the application's static files |
| buildActions | <code>function</code> | zips and/or bundles the application's serverless functions |
| deployUI | <code>function</code> | deploys the static files to a CDN, returns the URL |
| deployActions | <code>function</code> | deploys the serverless functions to OpenWhisk |
| undeployUI | <code>function</code> | removes the deployed static files |
| undeployActions | <code>function</code> | deletes the deployed OpenWhisk actions |
| runDev | <code>function</code> | runs the app in a local development server, set env REMOTE_ACTIONS=true to use remotely deployed actions |
| addAuth | <code>function</code> | adds auth capabilities to the application |
| Logs | <code>function</code> | shows action logs |

