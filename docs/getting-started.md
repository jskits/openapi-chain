# Getting started

[Documentation index](README.md) · [API reference](api.md) · [Support matrix](support.md)

This guide uses the repository's [Items document](../examples/service.openapi.json): `GET /items/{id}` returns `{ id: string, name: string }` with status 200 or `{ error: string }` with status 404. Replace it with your own OpenAPI document to build your application's chain.

## Install a published package

For a published release with this API, install the runtime and the build-time CLI:

```sh
pnpm add openapi-chain
pnpm add -D @openapi-chain/cli
```

The CLI owns its type generator and a private TypeScript 5.9.3 dependency. Your application still needs a supported TypeScript compiler for type checking; if starting from a new application, install `typescript@6.0.3` as a development dependency. See [compiler compatibility](#generator-and-typescript-compatibility). The runtime has no production dependencies, and neither the CLI nor the OpenAPI document belongs in a browser bundle.

These instructions describe the current source checkout. Check the installed package versions and exports before applying them to a registry release: the [runtime manifest](../packages/core/package.json) and [CLI manifest](../packages/cli/package.json) show the source versions, not what npm currently serves. To verify this exact checkout, use the [local tarball consumer check](#install-this-checkout).

## Generate your types

Save the Items document as `openapi.json` in your application. Create `openapi-chain.config.json` beside it:

```json
{
  "schema": "./openapi.json",
  "outDir": "./src/generated/api",
  "paths": ["/items/{id}"]
}
```

Run generation once, then use the read-only check in CI:

```sh
pnpm exec openapi-chain generate
pnpm exec openapi-chain generate --check
```

The CLI emits `schema.d.ts`, `scope.ts`, `metadata.ts`, and `manifest.json` together. `ScopedPaths` includes only the selected exact paths; metadata includes the same operations. Commit the generated files, regenerate after changing the document or config, and do not hand-edit them. The CLI accepts local OpenAPI 3.0/3.1 JSON or YAML; bundle external references first. See the [CLI guide](cli.md) for configuration, ownership and `--check` behavior.

For a Node ESM application, set `"type": "module"` in `package.json`. A minimal relevant TypeScript configuration is:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true
  }
}
```

Use your framework's module settings for bundled applications. NodeNext uses `.js` relative import specifiers even when the source is TypeScript.

## Use strict serialization

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

Replace the example URL with a service implementing your document. Creating a client starts no server, and the OpenAPI `servers` field does not set `baseUrl` automatically. The generated metadata carries supported OpenAPI parameter and body serialization rules. The document and CLI stay out of the client bundle. Runtime metadata cannot reconstruct erased TypeScript types, so retain `<ScopedPaths>`.

For an existing core application, follow the [migration guide](migration.md) before switching. The call shape is shared, but serialization, validation and binary parsing can change. To inspect typed HTTP errors rather than throw them, use `throwOnError: false` and the [response contract](api.md#responses-and-errors). Network, abort, serialization and parser failures still reject.

## Make a core request

Core is the smaller schema-free serialization option. It uses the same generated scope type, but does not consume metadata:

```ts
import { createClient } from 'openapi-chain';
import type { ScopedPaths } from './generated/api/scope.js';

const api = createClient<ScopedPaths>({ baseUrl: 'https://api.example.com' });
const item = await api.items('42').get();
console.log(item.name);
```

For operations declaring a request body, core requires an explicit `contentType`. See [request inputs and bodies](api.md#request-inputs-and-bodies) for a checked Petstore example, query parameters and Fetch options. Check the [support matrix](support.md) when OpenAPI serialization matters; the core serializer cannot infer it from types alone.

## Generator and TypeScript compatibility

The minimum supported **application** compiler is TypeScript 6.0.3. CI pins and checks TypeScript 6.0.3 and 7.0.2, including installed declaration consumers. TypeScript 7.0.2 is recommended for large schemas and editor responsiveness; newer compiler versions need their own qualification. Keep using [path scoping](large-schemas.md): a faster compiler does not remove the cost of a large exposed route tree.

The official CLI privately pins TypeScript 5.9.3 for `openapi-typescript@7.13.0` generation. It does not change the application's compiler minimum. With the CLI path above, consumers do not install the generator directly or configure a peer override.

If you install the upstream type generator directly, for example to pair its output with programmatically compiled metadata, verify that toolchain separately. `openapi-typescript@7.13.0` declares `typescript: ^5.x`; this repository's verified direct-generator setup allows its TS 6.0.3 pairing under strict pnpm peer checks. Merge the following rule into your application's `pnpm-workspace.yaml`, preserving other settings:

```yaml
strictPeerDependencies: true
peerDependencyRules:
  allowedVersions:
    'openapi-typescript>typescript': '6.0.3'
```

Then install the exact tested versions and invoke the intended compiler explicitly:

```sh
pnpm add -D --save-exact typescript@6.0.3 typescript7@npm:typescript@7.0.2 openapi-typescript@7.13.0
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
node node_modules/typescript7/bin/tsc --noEmit
```

In `package.json`, the two checks can be:

```json
{
  "scripts": {
    "typecheck": "node node_modules/typescript7/bin/tsc --noEmit",
    "typecheck:ts6": "node node_modules/typescript/bin/tsc --noEmit"
  }
}
```

Both packages advertise a `tsc` binary, so explicit paths avoid ambiguity in `.bin`. The scoped peer rule only allows the generator's TS 6.0.3 pairing; it does not claim generator support for TS 7's compiler API. The repository's `pnpm test:package:ts7` checks this direct-generator setup in an isolated tarball consumer. For an editor, enable its TypeScript 7 native language server explicitly; installing the alias alone does not switch an editor still using TS 6 tsserver. See the [TypeScript 7 side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).

For manual strict metadata, compile the same parsed document used to generate `paths`:

```ts
import document from './openapi.json' with { type: 'json' };
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import type { paths } from './schema.js';

const api = createStrictClient<paths>({
  baseUrl: 'https://api.example.com',
  metadata: compileOpenAPIMetadata(document),
});
```

Enable `resolveJsonModule` for this JSON import. The compiler accepts an object, not a filename or YAML string; external references must be bundled into supported local JSON Pointer references or dereferenced first. The compiler supports OpenAPI 3.2 metadata, but you must qualify a matching type generation path separately because the CLI rejects 3.2. Treat metadata as immutable and recreate the client when it changes. A cast of arbitrary JSON does not prove that metadata and types match.

## Install this checkout

From the repository root, use [the development toolchain](development.md) to build and check both local package tarballs in an isolated application:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:cli:package
```

`test:cli:package` packs the runtime and CLI, installs them into a temporary consumer, runs the installed command, checks generated types and metadata, and exercises an HTTP request. It uses a local runtime tarball override so the CLI resolves the same checkout rather than a registry copy. `pnpm test:package` separately checks the runtime's public entry points. These checks do not publish to npm; follow [the consumer script](../scripts/check-cli-package.mjs) when reproducing its tarball installation in another application.

## Run the offline repository example

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run test/example.test.ts
pnpm typecheck
```

[complete-client.ts](../examples/complete-client.ts) exports `runExample()`, which the test calls using a deterministic mock transport. It demonstrates both clients, status-correlated results and runtime response validation, and returns `{ name: 'Ada', message: 'not found' }`. No public service or credentials are needed.

The declarations in [service-schema.d.ts](../examples/service-schema.d.ts) are already checked in. `pnpm test:generated` verifies the checked-in generated fixtures; `pnpm generate:example` regenerates them when their source documents change.

## Next steps

- Generate types and metadata together with the [build-time CLI](cli.md).
- Add [authentication or cancellation](api.md#transport-authentication-and-cancellation).
- Learn the [response and error contract](api.md#responses-and-errors).
- Check [serialization and platform limits](support.md) before using forms or binary data.
- Use [troubleshooting](troubleshooting.md) for type, media and browser errors.
- Run repository and browser checks with the [development guide](development.md).
