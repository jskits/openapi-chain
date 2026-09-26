# openapi-chain

[![npm version](https://img.shields.io/npm/v/openapi-chain.svg)](https://www.npmjs.com/package/openapi-chain) [![npm downloads](https://img.shields.io/npm/dm/openapi-chain.svg)](https://www.npmjs.com/package/openapi-chain) [![CI](https://github.com/jskits/openapi-chain/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jskits/openapi-chain/actions/workflows/ci.yml) [![TypeScript](https://img.shields.io/badge/TypeScript-typed-3178C6?logo=typescript&logoColor=white)](https://github.com/jskits/openapi-chain/blob/main/docs/api.md) [![Modules](https://img.shields.io/badge/modules-ESM%20%2B%20CommonJS-blue)](https://github.com/jskits/openapi-chain/blob/main/docs/api.md#entry-points) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/jskits/openapi-chain/blob/main/LICENSE)

A TypeScript OpenAPI client with a fluent path API, zero generated client code, and no runtime dependencies. Generate a `paths` type, then call your API through typed properties and functions:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const item = await api.items('42').get();
console.log(item.name);
```

This example uses the [Items schema](https://github.com/jskits/openapi-chain/blob/main/examples/service.openapi.json). Your chain follows your own schema: static path segments become properties, `{parameters}` become function calls, and HTTP methods become request functions.

- **Typed requests and responses:** infer parameters, request media types and status-correlated results from the selected operation.
- **Small default runtime:** the complete emitted core has a **3.5 KiB gzip budget**, enforced by a [reproducible size check](https://github.com/jskits/openapi-chain/blob/main/docs/performance.md#size).
- **Opt-in OpenAPI serialization:** a separate strict client handles supported styles, Encoding Objects and OpenAPI 3.0/3.1/3.2 serialization metadata.
- **Customizable requests:** operation-typed extensions and Fetch-compatible transports support application-specific serialization, authentication and parsing.

## Install

**TypeScript 7 is recommended for type checking and editor responsiveness, especially for large schemas.** Use the [verified dual-version setup](https://github.com/jskits/openapi-chain/blob/main/docs/getting-started.md#generator-and-typescript-compatibility): TS 7.0.2 checks your application while TS 6.0.3 remains available to the generator and tools using its compiler API. Apply the scoped peer configuration there before installing. Large schemas still benefit from [path scoping](https://github.com/jskits/openapi-chain/blob/main/docs/large-schemas.md).

For an npm release that contains the API documented here:

```sh
pnpm add openapi-chain
pnpm add -D --save-exact typescript@6.0.3 typescript7@npm:typescript@7.0.2 openapi-typescript@7.13.0
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
```

These docs describe the current source API. Check [package.json](package.json) for the checkout version; an installed npm release may expose a different API. To try this exact implementation, follow [the local tarball installation](https://github.com/jskits/openapi-chain/blob/main/docs/getting-started.md#install-this-checkout). Type generation produces declarations only; no endpoint client code is generated.

The package exports ESM and CommonJS. Its Node.js engine range is `^22.22.1 || ^24.11.0 || >=26.0.0`. Browser use requires standard Fetch APIs and a bundler or ESM setup; Chromium has an integration suite. Enable TypeScript strict mode and include DOM types. See [setup and compatibility](https://github.com/jskits/openapi-chain/blob/main/docs/getting-started.md).

## Choose a client

| Need | Entry point | Runtime schema |
| --- | --- | --- |
| Fluent typed calls with schema-free serialization defaults | `openapi-chain` → `createClient` | None |
| OpenAPI parameter styles, structured forms or multipart encoding | `openapi-chain/strict` → `createStrictClient` | Compiled metadata |
| Compile serialization metadata from an OpenAPI document | `openapi-chain/metadata` → `compileOpenAPIMetadata` | OpenAPI 3.0, 3.1 or 3.2 object |

Core requires an explicit `contentType` whenever a body is supplied. Strict can infer a single declared concrete media type and implements additional serialization rules. Both expose the same fluent path API and operation-local extensions. See the [support matrix](https://github.com/jskits/openapi-chain/blob/main/docs/support.md) before choosing serialization behavior.

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

For browser/edge and large schemas, use the [build-time metadata and single-scope workflow](https://github.com/jskits/openapi-chain/blob/main/docs/large-schemas.md) so the document and compiler stay out of the runtime bundle.

For an existing core application, follow the [migration guide](https://github.com/jskits/openapi-chain/blob/main/docs/migration.md) and compare representative requests before switching. Core cannot detect missing serialization rules from erased types; HTTP 200 is not proof of a correct filter.

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

Response types assume the server follows the schema. For runtime validation, binary data or streaming, use a [response extension](https://github.com/jskits/openapi-chain/blob/main/docs/api.md#extensions). Core defaults to JSON/text parsing; strict also returns `ArrayBuffer` for other media. See the full [response contract](https://github.com/jskits/openapi-chain/blob/main/docs/api.md#responses-and-errors).

## Documentation

| Guide | Contents |
| --- | --- |
| [Getting started](https://github.com/jskits/openapi-chain/blob/main/docs/getting-started.md) | Installation, type generation and a runnable offline example |
| [API reference](https://github.com/jskits/openapi-chain/blob/main/docs/api.md) | Client options, paths, bodies, errors, extensions and transports |
| [Support and boundaries](https://github.com/jskits/openapi-chain/blob/main/docs/support.md) | Serialization matrix, metadata inference and platform limits |
| [Troubleshooting](https://github.com/jskits/openapi-chain/blob/main/docs/troubleshooting.md) | Common type, serialization, Fetch and response problems |
| [Performance](https://github.com/jskits/openapi-chain/blob/main/docs/performance.md) | Size budgets, benchmark methods and dated measurements |
| [Architecture](https://github.com/jskits/openapi-chain/blob/main/docs/architecture.md) | Type model, package boundaries and source map |
| [Development](https://github.com/jskits/openapi-chain/blob/main/docs/development.md) | Local setup, checks, browser tests and release workflow |
| [Documentation index](https://github.com/jskits/openapi-chain/blob/main/docs/README.md) | All guides and historical qualification reports |

## Contributing and support

Start with [CONTRIBUTING.md](https://github.com/jskits/openapi-chain/blob/main/CONTRIBUTING.md). Report bugs or request features in [GitHub Issues](https://github.com/jskits/openapi-chain/issues); include the entry point, package version and a minimal schema. Report vulnerabilities through the [security process](https://github.com/jskits/openapi-chain/blob/main/SECURITY.md).

## Build-time generation

The separate `@openapi-chain/cli` package provides an official `openapi-chain generate` command for local OpenAPI 3.0/3.1 JSON/YAML documents. One config produces full type declarations, scoped client types, selected runtime metadata and a provenance manifest. `generate --check` detects drift without writing files.

See the [CLI guide](https://github.com/jskits/openapi-chain/blob/main/docs/cli.md) and [runnable scoped example](https://github.com/jskits/openapi-chain/blob/main/docs/large-schemas.md). CLI dependencies remain separate from the runtime package and browser bundles.

## License

[MIT](https://github.com/jskits/openapi-chain/blob/main/LICENSE)
