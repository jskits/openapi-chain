# Migrating to the `@openapi-chain` scope

[Documentation index](README.md) · [Getting started](getting-started.md) · [Release setup](development.md#release-setup)

The repository now uses pnpm workspaces and Turbo. The public package names are `@openapi-chain/core`, `@openapi-chain/cli`, and `@openapi-chain/query`. Existing `openapi-chain` imports remain available through a small compatibility package that re-exports the scoped core. The binary command remains `openapi-chain`.

| Previous package or import | New package or import          |
| -------------------------- | ------------------------------ |
| `openapi-chain`            | `@openapi-chain/core`          |
| `openapi-chain/strict`     | `@openapi-chain/core/strict`   |
| `openapi-chain/metadata`   | `@openapi-chain/core/metadata` |
| `openapi-chain-cli`        | `@openapi-chain/cli`           |
| `openapi-chain-query`      | `@openapi-chain/query`         |

For a new application, install only the packages it uses:

```sh
pnpm add @openapi-chain/core
pnpm add -D @openapi-chain/cli
pnpm add @openapi-chain/query
```

Existing applications can continue importing `openapi-chain` after upgrading that package. The compatibility package depends on `@openapi-chain/core`; both names refer to the same runtime exports when the same core version is installed. Avoid installing both names at mismatched versions. The CLI now emits type-only metadata imports from `@openapi-chain/core/metadata`; regenerate its managed directory with `pnpm exec openapi-chain generate --config openapi-chain.config.json` after upgrading. The generated directory stays owned by the CLI and should not be hand-edited.

The new scoped packages must be published before they can be installed from npm. Check their registry pages and versions rather than assuming a local build or tarball check means they are available. Maintainers should follow the [bootstrap and Trusted Publisher setup](development.md#release-setup) before enabling automated releases.
