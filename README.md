<div align="center">

<img src="assets/logo/openapi-chain-logo-1024.png" alt="openapi-chain logo" width="420">

# openapi-chain

**A type-safe OpenAPI client for complex and large APIs, whose requests follow the document's wire
rules exactly.**

[![CI][ci-badge]][ci] [![TypeScript][typescript-badge]][typescript]
[![Modules][modules-badge]][modules]
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Documentation](https://jskits.github.io/openapi-chain/) ·
[Getting started](docs/getting-started.md) · [Wire comparison](docs/wire-comparison.md) ·
[Changelog](packages/core/CHANGELOG.md)

</div>

openapi-chain compiles the serialization rules an OpenAPI document declares (parameter `style`,
`explode`, `allowReserved` and `content`, request media types, and form and multipart Encoding
Objects) and applies them to every request. A build-time CLI generates types and metadata scoped to
the paths you call, so large documents stay affordable to type-check and to ship. Calls use a fluent
path API with no generated endpoint code and no runtime dependencies.

The pnpm monorepo contains three publishable packages: [`openapi-chain`](packages/core),
[`@openapi-chain/cli`](packages/cli), and [`@openapi-chain/query`](packages/query). The runtime
keeps its existing package name and entry points. See the
[package migration guide](docs/migration-to-scope.md) for CLI and query import changes and release
availability.

The first request below uses the [Items schema](examples/service.openapi.json). Your chain follows
your own schema: static path segments become properties, `{parameters}` become function calls, and
HTTP methods become request functions.

- **Exact wire serialization:** the strict client sends what the document specifies and rejects
  representations it cannot encode instead of guessing. The
  [wire comparison](docs/wire-comparison.md) executes 20 declarations through both clients:
  openapi-fetch 0.17.0 sends a request with different values, media type or missing parameters in 16
  of them, and differs only in percent-encoding or list spacing in 3 more.
- **Scoped generation for large documents:** one CLI config produces full declarations, a path scope
  and matching runtime metadata. On the pinned GitHub REST document, scoping a 40-operation consumer
  reduced openapi-chain's TypeScript 7 check time from 0.49 s to 0.045 s
  ([real-schema measurements](docs/performance.md#real-schemas)).
- **Typed requests and responses:** infer parameters, request media types and status-correlated
  results from the selected operation.
- **Keep openapi-fetch if you already use it:** `openapi-chain/openapi-fetch` applies the same
  serialization to an existing openapi-fetch client
  ([adapter guide](docs/openapi-fetch-adapter.md)).
- **Small schema-free core:** the default client has a **3.5 KiB gzip budget**, enforced by a
  [reproducible size check](docs/performance.md#size); its bundle size and per-request overhead are
  in the same range as openapi-fetch
  ([client comparison](docs/performance.md#comparison-with-other-clients)).
- **Customizable requests:** operation-typed extensions and Fetch-compatible transports support
  application-specific serialization, authentication and parsing.

## When to choose openapi-chain

Choose the strict client when your document declares non-default parameter styles, parameter
`content`, cookie parameters, non-JSON media types or form and multipart encoding, and the server
depends on them. Choose the CLI's scoped generation when a large document makes type-checking or
metadata delivery expensive. If your API only uses JSON bodies and default parameter styles,
openapi-fetch and openapi-chain's core are comparable in size and speed; pick the call style you
prefer. Without scoping, openapi-chain's fluent types cost more to check than openapi-fetch's on the
measured GitHub and Stripe documents.

## Install

For a published release with this API:

```sh
pnpm add openapi-chain
pnpm add -D @openapi-chain/cli
```

Save the Items document as `openapi.json`, then create `openapi-chain.config.json`:

```json
{
  "schema": "./openapi.json",
  "outDir": "./src/generated/api",
  "paths": ["/items/{id}"]
}
```

Generate types and metadata together:

```sh
pnpm exec openapi-chain generate
pnpm exec openapi-chain generate --check
```

In `src/client.ts`, use the generated scope and metadata for the first request:

```ts
import { createStrictClient } from 'openapi-chain/strict';
import { metadata } from './generated/api/metadata.js';
import type { ScopedPaths } from './generated/api/scope.js';

const api = createStrictClient<ScopedPaths>({
  baseUrl: 'https://api.example.com',
  metadata,
});
const item = await api.items('42').get();
console.log(item.name);
```

Replace the example URL with your service. The minimum supported application compiler is TypeScript
6.0.3; install it in a new application if TypeScript is not already present. CI pins 6.0.3 and
7.0.2. TypeScript 7.0.2 is recommended for large schemas and editor responsiveness. The CLI
privately installs TypeScript 5.9.3 for generation, so this path needs no generator peer override.
See [compiler compatibility](docs/getting-started.md#generator-and-typescript-compatibility) and
[path scoping](docs/large-schemas.md).

These docs describe the current source API. The source manifests show the checkout versions:
[runtime](packages/core/package.json), [CLI](packages/cli/package.json), and
[query adapter](packages/query/package.json). An installed npm release may expose a different API.
To try this exact implementation, follow
[the local tarball consumer check](docs/getting-started.md#install-this-checkout). Generation
produces declarations and metadata, not endpoint client code.

The package exports ESM and CommonJS. Its Node.js engine range is
`^22.22.1 || ^24.11.0 || >=26.0.0`. Browser use requires standard Fetch APIs and a bundler or ESM
setup; Chromium has an integration suite. Enable TypeScript strict mode and include DOM types. See
[setup and compatibility](docs/getting-started.md).

## Choose a client

| Need                                                             | Entry point                                                | Runtime schema                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| Fluent typed calls with schema-free serialization defaults       | `openapi-chain` → `createClient`                           | None                           |
| OpenAPI parameter styles, structured forms or multipart encoding | `openapi-chain/strict` → `createStrictClient`              | Compiled metadata              |
| Compile serialization metadata from an OpenAPI document          | `openapi-chain/metadata` → `compileOpenAPIMetadata`        | OpenAPI 3.0, 3.1 or 3.2 object |
| Keep openapi-fetch calls with the strict serializer              | `openapi-chain/openapi-fetch` → `withOpenAPISerialization` | Compiled metadata              |

Core requires an explicit `contentType` whenever a body is supplied. Strict can infer a single
declared concrete media type and implements additional serialization rules. Both expose the same
fluent path API and operation-local extensions. The programmatic compiler remains available for
manual workflows and OpenAPI 3.2 metadata; the official CLI currently generates OpenAPI 3.0/3.1
types and metadata. See the [support matrix](docs/support.md) before choosing serialization
behavior.

The generated strict client above keeps the document, CLI and compiler out of browser bundles. For
large schemas, follow the [single-scope workflow](docs/large-schemas.md).

For an existing core application, follow the [migration guide](docs/migration.md) and compare
representative requests before switching. Core cannot detect missing serialization rules from erased
types; HTTP 200 is not proof of a correct filter.

Generate `paths` and metadata from the same schema revision. Strict checks request structure and
supported wire encodings; it is **not a JSON Schema validator**. Response validation, authentication
and retries are application responsibilities.

## Handle responses

By default, calls return parsed success data and throw `HttpError` for non-2xx responses. Use
`throwOnError: false` to receive a typed result instead:

```ts
import { createStrictClient } from 'openapi-chain/strict';
import { metadata } from './generated/api/metadata.js';
import type { ScopedPaths } from './generated/api/scope.js';

const api = createStrictClient<ScopedPaths>({
  baseUrl: 'https://api.example.com',
  metadata,
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

Response types assume the server follows the schema. For runtime validation, binary data or
streaming, use a [response extension](docs/api.md#extensions). Core defaults to JSON/text parsing;
strict also returns `ArrayBuffer` for other media. See the full
[response contract](docs/api.md#responses-and-errors).

## Documentation

| Guide                                                  | Contents                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)             | Installation, type generation and a runnable offline example                                       |
| [API reference](docs/api.md)                           | Client options, paths, bodies, errors, extensions and transports                                   |
| [Support and boundaries](docs/support.md)              | Serialization matrix, metadata inference and platform limits                                       |
| [Troubleshooting](docs/troubleshooting.md)             | Common type, serialization, Fetch and response problems                                            |
| [Wire comparison](docs/wire-comparison.md)             | Requests openapi-chain and openapi-fetch send for the same OpenAPI declarations, verified by tests |
| [openapi-fetch adapter](docs/openapi-fetch-adapter.md) | Strict serialization inside an existing openapi-fetch client, or for another HTTP client           |
| [Performance](docs/performance.md)                     | Size budgets, client comparisons, benchmark methods and dated measurements                         |
| [Architecture](docs/architecture.md)                   | Type model, package boundaries and source map                                                      |
| [Development](docs/development.md)                     | Local setup, checks, browser tests and release workflow                                            |
| [Documentation index](docs/README.md)                  | All guides and historical qualification reports                                                    |

## Contributing and support

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report bugs or request features in
[GitHub Issues](https://github.com/jskits/openapi-chain/issues); include the entry point, package
version and a minimal schema. Report vulnerabilities through the [security process](SECURITY.md).

## Build-time generation

The separate `@openapi-chain/cli` package provides the `openapi-chain generate` command for local
OpenAPI 3.0/3.1 JSON/YAML documents. One config produces full type declarations, scoped client
types, selected runtime metadata and a provenance manifest. `generate --check` detects drift without
writing files.

See the [CLI guide](docs/cli.md) and [runnable scoped example](docs/large-schemas.md). CLI
dependencies remain separate from the runtime package and browser bundles.

## License

[MIT](LICENSE)

[ci-badge]: https://github.com/jskits/openapi-chain/actions/workflows/ci.yml/badge.svg?branch=main
[ci]: https://github.com/jskits/openapi-chain/actions/workflows/ci.yml
[typescript-badge]:
  https://img.shields.io/badge/TypeScript-typed-3178C6?logo=typescript&logoColor=white
[typescript]: docs/api.md
[modules-badge]: https://img.shields.io/badge/modules-ESM%20%2B%20CommonJS-blue
[modules]: docs/api.md#entry-points
