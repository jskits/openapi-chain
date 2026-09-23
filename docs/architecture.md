# Architecture

[Documentation index](README.md) · [API reference](api.md) · [Support matrix](support.md)

The packages separate compile-time API structure, the tiny schema-free runtime, and the opt-in exact-wire runtime. The repository root is a private pnpm workspace; Turbo builds the publishable packages under `packages/`.

| Workspace         | npm package            | Role                                         |
| ----------------- | ---------------------- | -------------------------------------------- |
| `packages/core`   | `@openapi-chain/core`  | Runtime, strict client and metadata compiler |
| `packages/cli`    | `@openapi-chain/cli`   | Node-only generation command                 |
| `packages/query`  | `@openapi-chain/query` | Optional TanStack Query and SWR adapter      |
| `packages/legacy` | `openapi-chain`        | Compatibility exports for existing consumers |

## Type layer

1. An external OpenAPI type generator produces a `paths` type.
2. Each HTTP operation becomes its own internal path entry; operation-level parameter overrides are never flattened away.
3. Recursive conditional/template-literal types build a shared prefix tree.
4. Static segments become properties and exact `{param}` segments become callable nodes.
5. Calling a dynamic node filters the remaining entries by the supplied value type, preserving branch correlation.
6. Method leaves infer parameter locations, media-correlated request bodies, and response data.
7. Response typing applies OpenAPI matching precedence: exact status > `nXX` wildcard > `default`.
8. `$path()` provides a typed structural escape hatch.
9. Each method input contains `OperationExtensions<Item, Operation>`, so serialization/request/response escapes are derived from the exact operation rather than widened to generic `unknown` callbacks.

## Runtime package boundary

### Core entry

`@openapi-chain/core` contains only the schema-free Proxy/path/request engine and mainstream defaults. It does **not** import the metadata compiler or exact-wire serializer.

The core intentionally omits runtime features that would require preserving the whole OpenAPI serialization model. Type erasure is treated as a hard boundary: if a value cannot be serialized faithfully without metadata, the core requires either explicit information or an operation-local extension.

The transitive ESM core is gzip-gated at 3072 bytes. The size script recursively follows local ESM imports from `dist/index.js`, gzips the complete reachable runtime, and fails CI on regression.

### Strict entry

`@openapi-chain/core/strict` owns the exact-wire serializer. It consumes branded `CompiledOpenAPIMetadata` and implements runtime-only OpenAPI semantics such as parameter styles, `explode`, `allowReserved`, Parameter `content`, request-body Encoding Objects, multipart/form-urlencoded details, and OpenAPI 3.2 `querystring`/`cookie` behavior.

### Metadata entry

`@openapi-chain/core/metadata` compiles only serialization-relevant OpenAPI data. It is independent from both client entry points, so importing the tiny core cannot pull the compiler into an application bundle.

## Operation-derived extensions

Extensions live on a method call rather than only in global client options:

See the [typed extension example](api.md#extensions) for a complete call using a checked-in schema.

The callback types are computed from the selected OpenAPI item/operation:

- `path` receives that operation's path-parameter value union;
- `query`, `querystring`, `header`, and `cookie` receive their exact location records;
- `body` receives the correlated **whole request body** and resolved concrete media type; strict internals never reuse it for an individual form field or multipart part;
- `response` returns a status-correlated `{ status, data }` union derived from the operation, and runtime verifies the returned status matches the actual HTTP response;
- `request` receives the final Fetch-style request plus the exact typed operation input.

At runtime these callbacks are ordinary functions. Their safety exists entirely at compile time and therefore adds no generated endpoint code.

When invoked, local extensions have precedence over built-in serialization in both core and strict clients. Both clients invoke query extensions for explicitly supplied empty records; strict validates required and undeclared inputs first. See the [invocation contract](api.md#extension-invocation-conditions). A body extension takes ownership of the entire body; nested strict serializers either handle their field/part exactly or fail closed so a typed whole-body extension can take over before final request construction. This makes the long tail composable instead of forcing rare OpenAPI/vendor semantics into the 3KB core.

## Strict serialization model

Generated OpenAPI delimiters are never encoded as user data. Values/keys are encoded independently and then joined with the delimiter required by the selected style.

`application/x-www-form-urlencoded` distinguishes WHATWG form defaults from explicit RFC6570/RFC3986-style Encoding Object behavior. Multipart uses native `FormData` only where its data model is sufficient. Ordered/nested parts, custom per-part headers, transfer encodings, and ambiguous part media choices fail closed unless an extension/custom serializer takes ownership.

## OpenAPI 3.2

The strict compiler/runtime understands the 3.2 fixed `QUERY` method, `in: querystring`, and `style: cookie`. Arbitrary `additionalOperations` are detected and rejected instead of being silently omitted from supposedly complete metadata.

## Fail-closed rules

The implementation prefers an explicit error over a request with a plausible but incorrect wire representation. Important examples:

- external `$ref` without bundling/dereferencing;
- missing route/method/required input in complete strict metadata;
- structured schema-free bodies without enough media information;
- invalid style/location combinations;
- conflicting `query` and `querystring` inputs;
- ambiguous chain templates;
- advanced multipart behavior unavailable through native Fetch primitives;
- compound cookie values with legacy `style: form`, whose RFC6570 `&` delimiter is not a faithful `Cookie` header representation.

The intended progression is: tiny default -> operation-local typed extension -> strict metadata runtime -> custom transport. Rare behavior never needs to inflate the default core. Final request extensions and transports run only after input validation and location/body serialization; use those earlier extension points when serialization itself needs replacing.

Serialization inference tracks active schema references through `allOf` and `items`. Ordinary recursive object properties can still be represented as JSON parts. Cycles that prevent determining a part's kind or media type throw a descriptive `TypeError`; inference is also bounded to 128 nested schema visits. Simplify the serialization schema in these cases rather than relying on unbounded recursive inference.

Rendered paths containing whole `.` or `..` segments (including `%2e` spellings) are rejected before transport. Fetch normalizes these segments, so encoding a dot is insufficient to preserve the intended endpoint. This check also applies to operation path extensions; filenames such as `file.txt` remain valid.

Strict clients index route shapes and HTTP methods at creation. Both chain and `$path()` routing use that snapshot; changing the routing table requires creating a new client. Request matching is proportional to path depth rather than total schema route count. Strict construction deep-clones and freezes the metadata, so routing and serialization read the same private snapshot for the client's lifetime. Mutating a caller-owned artifact cannot change an existing client.

## Implementation map

- `client.ts`: schema-free request pipeline with descriptive runtime/state names.
- `strict-client.ts`: strict client orchestration, middleware, parsing and Proxy API.
- `serialization.ts`: strict wire encodings and request validation, without transport I/O.
- `routes.ts`: the strict routing snapshot and lookups.
- `path.ts`: shared dot-segment policy.
- `media.ts`: shared media classification and generated-text charset checks.
- `constant.ts`: the fixed supported HTTP method names.
- `metadata.ts`: OpenAPI serialization metadata compiler.
- `type.ts`: public contracts and operation-derived type computation.

Shared behavior is qualified through core/strict contract tests rather than merging the whole strict serializer into the core dependency graph.

## Optional query integration

`@openapi-chain/query` is a separate workspace/package with no runtime dependencies. Its explicit operation key and callback API supports TanStack Query and SWR without inspecting client Proxies or changing the core. It copies and freezes JSON inputs to keep cache identity aligned with the eventual request. Framework lifecycle, retries and invalidation remain application policy. See [integration recipes](integrations.md).
