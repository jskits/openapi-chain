# @openapi-chain/cli

Build-time type declarations, scoped client types and serialization metadata for [openapi-chain](https://github.com/jskits/openapi-chain).

```sh
pnpm add openapi-chain
pnpm add -D @openapi-chain/cli
pnpm exec openapi-chain generate --config openapi-chain.config.json
pnpm exec openapi-chain generate --config openapi-chain.config.json --check
```

```json
{
  "schema": "./openapi.yaml",
  "outDir": "./src/generated/api",
  "paths": ["/items", "/items/{id}"]
}
```

Paths are relative to the config file. Omit `paths` to select all paths; `[]` selects none. Each selected path includes all its operations. The output directory is owned exclusively by the generator. Do not put hand-written files there.

```ts
import { createStrictClient } from 'openapi-chain/strict';
import { metadata } from './generated/api/metadata.js';
import type { ScopedPaths } from './generated/api/scope.js';

const api = createStrictClient<ScopedPaths>({ baseUrl: 'https://api.example.com', metadata });
```

The CLI supports local OpenAPI 3.0/3.1 JSON and YAML files. Bundle external `$ref` into local references before generation. OpenAPI 3.2 type generation is not yet supported by the pinned upstream generator; the CLI rejects it explicitly.

`--check` regenerates all expected output in memory, verifies source/config/tool provenance and content, and exits nonzero if any file is stale or missing. It never writes files. Generated source is deterministic and should not be reformatted. Exclude the output directory from formatter/linter writes.

TypeScript 5.9.3 is a private CLI generation dependency. Applications can use their own TypeScript version. The runtime package and browser bundles do not depend on this Node-only toolchain.

See the repository's [CLI guide](https://github.com/jskits/openapi-chain/blob/main/docs/cli.md) for contracts, CI integration and troubleshooting.
