---
'@openapi-chain/query': patch
---

Reject statically identifiable non-JSON input types when defining `createQuery()`. Runtime validation remains responsible for values such as cycles, `NaN`, and explicit `undefined` fields.
