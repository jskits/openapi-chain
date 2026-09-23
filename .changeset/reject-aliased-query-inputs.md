---
"openapi-chain-query": patch
---

Reject `__proto__` object keys in query inputs and prefixes before TanStack Query can hash them into another input's cache entry. Reject arrays with extra properties instead of silently discarding fetch inputs, and snapshot array elements by index.
