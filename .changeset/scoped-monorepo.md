---
"@openapi-chain/core": patch
"@openapi-chain/cli": patch
"@openapi-chain/query": patch
"openapi-chain": patch
---

Move the runtime, CLI and query adapter into the `@openapi-chain` npm scope. Keep `openapi-chain` as a compatibility package that re-exports the scoped core entry points. Organize the repository as a pnpm monorepo with Turbo builds and independent packed-consumer checks.
