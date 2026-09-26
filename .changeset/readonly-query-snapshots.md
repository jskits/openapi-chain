---
'@openapi-chain/query': minor
---

Expose recursively readonly types for Query fetcher inputs and the input stored at the end of operation keys. This matches the existing frozen runtime snapshots and prevents typed fetchers from mutating cached request data. Annotate fetcher inputs with `ReadonlyQueryInput<T>` or readonly fields; copy readonly arrays when forwarding them to generated operation types that require mutable arrays.
