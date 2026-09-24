# Package names in the monorepo

[Documentation index](README.md) · [Getting started](getting-started.md) · [Release setup](development.md#release-setup)

The repository uses pnpm workspaces and Turbo. The runtime is published directly as `openapi-chain` from `packages/core`. Its `openapi-chain/strict` and `openapi-chain/metadata` entry points remain available. No compatibility wrapper is required.

| Package       | npm name               |
| ------------- | ---------------------- |
| Runtime       | `openapi-chain`        |
| CLI           | `@openapi-chain/cli`   |
| Query adapter | `@openapi-chain/query` |

Install only the packages your application uses:

```sh
pnpm add openapi-chain
pnpm add -D @openapi-chain/cli
pnpm add @openapi-chain/query
```

Applications already importing `openapi-chain` keep their existing imports. Replace an old `openapi-chain-cli` dependency with `@openapi-chain/cli`, and `openapi-chain-query` with `@openapi-chain/query`. The binary command remains `openapi-chain`. Generated metadata uses the type-only import `openapi-chain/metadata`; regenerate the managed output with `pnpm exec openapi-chain generate --config openapi-chain.config.json` after upgrading.

The two scoped packages must be published before they can be installed from npm. Maintainers should follow the [bootstrap and Trusted Publisher setup](development.md#release-setup). A local build or tarball check does not establish registry availability.
