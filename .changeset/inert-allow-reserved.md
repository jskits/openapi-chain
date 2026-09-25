---
'openapi-chain': patch
---

Ignore `allowReserved` on parameters where OpenAPI says it does not apply, such as path and header parameters in OpenAPI 3.0/3.1, instead of failing compilation of the whole document. Query parameters, and OpenAPI 3.2 path parameters and `form` cookies, still use reserved expansion.
