---
'openapi-chain': patch
---

Accept `style: deepObject` parameters and Encoding Objects without an explicit `explode: true`. OpenAPI 3.2 states that `explode` has no effect on `deepObject` and defaults to `false`, so the default spelling previously failed compilation, and explicit `explode: false` failed form and multipart serialization. All spellings now compile to the same metadata and send the same `name[key]=value` pairs.
