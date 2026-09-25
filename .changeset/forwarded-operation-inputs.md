---
'openapi-chain': patch
---

Accept forwarded `OperationInputFor` values for every request-body shape again. Since 0.5.1, passing such a value to its operation failed to type-check when the operation had an optional request body, and forwarded inputs without a body or relying on strict single-media inference were also affected. Literal calls still take exactly the selected media declaration's body.
