# @openapi-chain/query

## 0.5.0

### Package migration

- Rename the adapter package from `openapi-chain-query` to `@openapi-chain/query` and align its version with the 0.5.0 release. Update dependencies and `createQuery` imports to `@openapi-chain/query`.
- Move the package into `packages/query` with Turbo builds and independent ESM, CommonJS, declaration and browser bundle checks. The adapter remains free of runtime dependencies; install TanStack Query or SWR separately as needed.
- Preserve the existing `createQuery` API, immutable JSON input snapshots, TanStack Query cancellation forwarding, SWR fetchers and cache-key validation. This package migration introduces no additional query runtime behavior changes beyond those recorded in 0.2.0.

## 0.2.0

### Minor Changes

- 7d3168b: Introduce a separate dependency-free query adapter with explicit operation keys, immutable JSON input snapshots, TanStack Query cancellation forwarding and SWR fetchers. Keep cache scope, retries, mutations and invalidation under application control.

### Patch Changes

- ee9b70e: Reject `__proto__` object keys in query inputs and prefixes before TanStack Query can hash them into another input's cache entry. Reject arrays with extra properties instead of silently discarding fetch inputs, and snapshot array elements by index.
