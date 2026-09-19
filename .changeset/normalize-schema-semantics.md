---
"openapi-chain": patch
---

Select request-body serialization from the most specific declared media type, including declarations that require no extra metadata. Broader media ranges no longer supply encoding rules to an exact declaration.

Memoize schema analysis within each compilation and bound traversal work independently of recursion depth. Cached results retain depth information, and compilation caches do not persist across document changes.

Exclude mixed path templates such as `{year}-{month}` and `{a}{b}` from callable dynamic chains; use `$path()` with the declared parameter types instead.

Preserve conjunctive allOf property definitions. Resolve references according to their object context and OpenAPI version: Reference Object siblings cannot override serialization fields, OAS 3.1/3.2 Schema Object siblings are conjunctive, and overlapping Path Item reference fields fail explicitly.

Add wire-invariance tests and a shared-schema DAG benchmark. Existing core-size and coverage gates remain enabled.
