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


# Add Auth

Script to add authentication actions to manifest. The script needs aio config to have parameters listed below. For a full list of configuration parameters, check the Config Index section below.

## Configuring with .env file

### Example
```
aio_ims__auth__type=code
aio_oauth_client__id=xxx
aio_oauth_client__secret=xxx
```

### Config Index
| Config | Description |
| --- | --- |
| aio_ims__auth__type | one of 'code' or 'jwt' |
| aio_oauth_client__id | client id of the console integration |
| aio_oauth_client__secret | client secret of the console integration |
| aio_oauth_scopes | ims auth scopes separated by comma for the specified client_id (default is 'openid,AdobeID') |
| aio_oauth_base__url | base url for authentication url (default is ims) |
| aio_oauth_redirect__url | url to redirect to after getting the access token |
| aio_oauth_cookie__path | cookie path to use for storing the user id |
| aio_oauth_persistence | persist the auth tokens |
| aio_oauth_my__auth__package | package name to use for binding to adobeio/oauth package |
| aio_oauth_my__cache__package | package name to use for binding to adobeio/cache package |
| aio_oauth_my__auth__seq__package | package name to use for authenticate sequence |
| aio_jwt-auth_client__id | client id of the console integration |
| aio_jwt-auth_client__secret | client secret of the console integration |
| aio_jwt-auth_jwt__payload | the payload with iss (org_id), sub (technical_account_id) and meta_scopes |
| aio_jwt-auth_jwt__private__key | private key of the service account integration |
| aio_jwt-auth_my__auth__package | package name to use for binding to adobeio/oauth package |
| aio_jwt-auth_my__cache__package | package name to use for binding to adobeio/cache package |
| aio_jwt-auth_my__auth__seq__package | package name to use for authenticate sequence |

## Configuring with aio config

### OAUTH
```javascript
oauth: {
   client_id: "xxx",
   client_secret: "xxx",
   redirect_url: "https://adobeioruntime.net/api/v1/web/<namespace>/<homepage>.html",
   persistence: 'true'
},
ims_auth_type: "code"
```

### JWT (for Service account)
```javascript
jwt-auth: {
client_id: "xxx",
client_secret: "xxx",
jwt_payload: {
   exp: 1559290108,
   iss: "xxx",
   sub: "xxx",
   "https://ims-na1.adobelogin.com/s/ent_user_sdk": true,
   "https://ims-na1.adobelogin.com/s/ent_adobeio_sdk": true,
   aud: "xxx"
},
token_exchange_url: "https://ims-na1.adobelogin.com/ims/exchange/jwt",
console_get_orgs_url: "https://api.adobe.io/console/organizations",
console_get_namespaces_url: "https://api.adobe.io/runtime/admin/namespaces/",
jwt_private_key: "-----BEGIN RSA PRIVATE KEY-----\njustafakekey\n-----END RSA PRIVATE KEY-----\n",
persistence: 'true'
},
ims_auth_type:"jwt"
```
### Config Index
| Config | Description |
| --- | --- |
| ims_auth_type | one of 'code' or 'jwt' |
| oauth.client_id | client id of the console integration |
| oauth.client_secret | client secret of the console integration |
| oauth.scopes | ims auth scopes separated by comma for the specified client_id (default is 'openid,AdobeID') |
| oauth.base_url | base url for authentication url (default is ims) |
| oauth.redirect_url | url to redirect to after getting the access token |
| oauth.cookie_path | cookie path to use for storing the user id |
| oauth.persistence | persist the auth tokens |
| oauth.my_auth_package | package name to use for binding to adobeio/oauth package |
| oauth.my_cache_package | package name to use for binding to adobeio/cache package |
| oauth.my_auth_seq_package | package name to use for authenticate sequence |
| jwt-auth.client_id | client id of the console integration |
| jwt-auth.client_secret | client secret of the console integration |
| jwt-auth.jwt_payload | the payload with iss (org_id), sub (technical_account_id) and meta_scopes |
| jwt-auth.jwt_private_key | private key of the service account integration |
| jwt-auth.my_auth_package | package name to use for binding to adobeio/oauth package |
| jwt-auth.my_cache_package | package name to use for binding to adobeio/cache package |
| jwt-auth.my_auth_seq_package | package name to use for authenticate sequence |
 
## Usage
After deploying the manifest.yml generated above, you have two URLs. One for the authentication (and persistence if enabled) and one to get the tokens.
- https://adobeioruntime.net/api/v1/web/<my_auth_seq_package>/authenticate
- https://adobeioruntime.net/api/v1/web/<my_auth_package>/tokens
