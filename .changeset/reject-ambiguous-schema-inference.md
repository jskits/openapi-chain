---
"openapi-chain": patch
---

Stop choosing the first non-null entry of a schema type array. Ambiguous form serialization requires a whole-body extension, including ambiguity reached through references, allOf, and array items. Nullable single-type inference and explicit JSON serialization remain supported.
