# @openapi-chain/query

## 0.2.0

### Minor Changes

- 7d3168b: Introduce a separate dependency-free query adapter with explicit operation keys, immutable JSON input snapshots, TanStack Query cancellation forwarding and SWR fetchers. Keep cache scope, retries, mutations and invalidation under application control.

### Patch Changes

- ee9b70e: Reject `__proto__` object keys in query inputs and prefixes before TanStack Query can hash them into another input's cache entry. Reject arrays with extra properties instead of silently discarding fetch inputs, and snapshot array elements by index.
