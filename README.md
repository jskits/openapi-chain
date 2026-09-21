# openapi-chain

[![npm version](https://img.shields.io/npm/v/openapi-chain.svg)](https://www.npmjs.com/package/openapi-chain) [![npm downloads](https://img.shields.io/npm/dm/openapi-chain.svg)](https://www.npmjs.com/package/openapi-chain) [![CI](https://github.com/jskits/openapi-chain/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jskits/openapi-chain/actions/workflows/ci.yml) [![TypeScript](https://img.shields.io/badge/TypeScript-typed-3178C6?logo=typescript&logoColor=white)](docs/api.md) [![Modules](https://img.shields.io/badge/modules-ESM%20%2B%20CommonJS-blue)](docs/api.md#entry-points) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A TypeScript OpenAPI client with a fluent path API, zero generated client code, and no runtime dependencies. Generate a `paths` type, then call your API through typed properties and functions:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const item = await api.items('42').get();
console.log(item.name);
```

This example uses the [Items schema](examples/service.openapi.json). Your chain follows your own schema: static path segments become properties, `{parameters}` become function calls, and HTTP methods become request functions.

- **Typed requests and responses:** infer parameters, request media types and status-correlated results from the selected operation.
- **Small default runtime:** the complete emitted core has a **2048-byte gzip budget**, enforced by a [reproducible size check](docs/performance.md#size).
- **Opt-in OpenAPI serialization:** a separate strict client handles supported styles, Encoding Objects and OpenAPI 3.0/3.1/3.2 serialization metadata.
- **Customizable requests:** operation-typed extensions and Fetch-compatible transports support application-specific serialization, authentication and parsing.

## Install

If you use TypeScript 6.0.3, first apply the [scoped generator peer configuration](docs/getting-started.md#generator-and-typescript-compatibility); openapi-typescript 7.13.0 declares a TypeScript 5 peer range.

For an npm release that contains the API documented here:

```sh
pnpm add openapi-chain
pnpm add -D openapi-typescript@7.13.0
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
```

This checkout is version **0.0.0** and documents the current source API; an existing npm release may expose a different API. To try this exact implementation, follow [the local tarball installation](docs/getting-started.md#install-this-checkout). Type generation produces declarations only; no endpoint client code is generated.

The package exports ESM and CommonJS. Its Node.js engine range is `^22.22.1 || ^24.11.0 || >=26.0.0`. Browser use requires standard Fetch APIs and a bundler or ESM setup; Chromium has an integration suite. Enable TypeScript strict mode and include DOM types. See [setup and compatibility](docs/getting-started.md).

## Choose a client

| Need | Entry point | Runtime schema |
| --- | --- | --- |
| Fluent typed calls with schema-free serialization defaults | `openapi-chain` → `createClient` | None |
| OpenAPI parameter styles, structured forms or multipart encoding | `openapi-chain/strict` → `createStrictClient` | Compiled metadata |
| Compile serialization metadata from an OpenAPI document | `openapi-chain/metadata` → `compileOpenAPIMetadata` | OpenAPI 3.0, 3.1 or 3.2 object |

Core requires an explicit `contentType` whenever a body is supplied. Strict can infer a single declared concrete media type and implements additional serialization rules. Both expose the same fluent path API and operation-local extensions. See the [support matrix](docs/support.md) before choosing serialization behavior.

```ts
import document from './openapi.json' with { type: 'json' };
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import type { paths } from './schema.js';

const api = createStrictClient<paths>({
  baseUrl: 'https://api.example.com',
  metadata: compileOpenAPIMetadata(document),
});

const item = await api.items('42').get();
```

For browser/edge and large schemas, use the [build-time metadata and single-scope workflow](docs/large-schemas.md) so the document and compiler stay out of the runtime bundle.

Generate `paths` and metadata from the same schema revision. Strict checks request structure and supported wire encodings; it is **not a JSON Schema validator**. Response validation, authentication and retries are application responsibilities.

## Handle responses

By default, calls return parsed success data and throw `HttpError` for non-2xx responses. Use `throwOnError: false` to receive a typed result instead:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({
  baseUrl: 'https://api.example.com',
  throwOnError: false,
});

try {
  const result = await api.items('42').get();
  if (result.ok) console.log(result.data.name);
  else console.error(result.status, result.data.error);
} catch (error) {
  // Network, cancellation, serialization and parsing failures still reject.
  console.error(error);
}
```

Response types assume the server follows the schema. For runtime validation, binary data or streaming, use a [response extension](docs/api.md#extensions). Core defaults to JSON/text parsing; strict also returns `ArrayBuffer` for other media. See the full [response contract](docs/api.md#responses-and-errors).

## Documentation

| Guide | Contents |
| --- | --- |
| [Getting started](docs/getting-started.md) | Installation, type generation and a runnable offline example |
| [API reference](docs/api.md) | Client options, paths, bodies, errors, extensions and transports |
| [Support and boundaries](docs/support.md) | Serialization matrix, metadata inference and platform limits |
| [Troubleshooting](docs/troubleshooting.md) | Common type, serialization, Fetch and response problems |
| [Performance](docs/performance.md) | Size budgets, benchmark methods and dated measurements |
| [Architecture](docs/architecture.md) | Type model, package boundaries and source map |
| [Development](docs/development.md) | Local setup, checks, browser tests and release workflow |
| [Documentation index](docs/README.md) | All guides and historical qualification reports |

## Contributing and support

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report bugs or request features in [GitHub Issues](https://github.com/jskits/openapi-chain/issues); include the entry point, package version and a minimal schema. Report vulnerabilities through the [security process](SECURITY.md).

## License

[MIT](LICENSE)
