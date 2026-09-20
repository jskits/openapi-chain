# Getting started

[Documentation index](README.md) · [API reference](api.md) · [Support matrix](support.md)

This guide uses the repository's [Items document](../examples/service.openapi.json): `GET /items/{id}` returns `{ id: string, name: string }` with status 200 or `{ error: string }` with status 404. Replace it with your own OpenAPI document to build your application's chain.

## Generator and TypeScript compatibility

The repository verifies openapi-typescript **7.13.0** with TypeScript **6.0.3**, but the generator declares a TypeScript peer range of `^5.x`. This repository permits that exact pairing through a scoped pnpm override. Its workspace configuration is not inherited when you install the library into another application.

If your application uses TypeScript 6.0.3, merge the following into its `pnpm-workspace.yaml` before installing the generator, preserving any existing workspace settings:

```yaml
strictPeerDependencies: true
peerDependencyRules:
  allowedVersions:
    'openapi-typescript>typescript': '6.0.3'
```

Then install the verified pair:

```sh
pnpm add -D typescript@6.0.3 openapi-typescript@7.13.0
```

This rule permits only the generator's TypeScript 6.0.3 peer; it keeps other peer checks enabled. Without it, strict peer checking rejects this pair with `ERR_PNPM_PEER_DEP_ISSUES`. Projects using another compiler version should check that pairing independently; the generator's declared TypeScript 5 support does not establish this library's compatibility with every TypeScript 5 version.

## Install a published package

After checking [generator compatibility](#generator-and-typescript-compatibility), install a published version with this API:

```sh
pnpm add openapi-chain
pnpm add -D openapi-typescript@7.13.0
```

The source checkout is currently `0.0.0`; these docs do not establish which API is available from the npm registry. Use the tarball route below to test this checkout. The generator is a development dependency, not a runtime requirement.

## Install this checkout

From the repository root, using [the development toolchain](development.md):

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:package
pnpm pack --out /tmp/openapi-chain-local.tgz
```

Then, from a separate application directory with [generator compatibility](#generator-and-typescript-compatibility) configured:

```sh
pnpm add /tmp/openapi-chain-local.tgz
pnpm add -D openapi-typescript@7.13.0
```

`test:package` installs a temporary consumer and checks all public entry points. It does not publish to npm. Choose another output path if `/tmp` is unavailable.

## Generate your types

Save the Items document as `openapi.json` in your application, then run:

```sh
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
```

JSON and YAML inputs are supported by the generator. Regenerate declarations when the document changes. Do not hand-edit generated types.

With [the verified generator/compiler pairing](#generator-and-typescript-compatibility) installed, a Node ESM application's `package.json` should contain `"type": "module"`; a minimal relevant TypeScript configuration is:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "resolveJsonModule": true
  }
}
```

Use your framework's module settings for bundled applications. `resolveJsonModule` is needed for the JSON import in the strict example; core only imports a type. NodeNext uses `.js` relative import specifiers even when the source is TypeScript.

## Make a core request

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const item = await api.items('42').get();
console.log(item.name);
```

Replace the example URL with a service implementing this schema. No server is started by creating a client. The OpenAPI `servers` field does not configure `baseUrl` automatically.

For operations declaring a request body, core requires an explicit `contentType`. See [request inputs and bodies](api.md#request-inputs-and-bodies) for a checked Petstore example, query parameters and Fetch options.

## Use strict serialization

Compile metadata from the same document that generated `paths`:

```ts
import document from './openapi.json' with { type: 'json' };
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import type { paths } from './schema.js';

const api = createStrictClient<paths>({
  baseUrl: 'https://api.example.com',
  metadata: compileOpenAPIMetadata(document),
  throwOnError: false,
});

try {
  const result = await api.items('42').get();
  if (result.ok) console.log(result.data.name);
  else console.error(result.status, result.data.error);
} catch (error) {
  console.error(error); // Includes network, abort and parser failures.
}
```

Alternatively, load and parse the document with your application's tooling before compilation. The compiler accepts an object, not a filename or YAML string. External references must be bundled into supported local JSON Pointer references or dereferenced before compilation.

Treat metadata as immutable and recreate the client when its schema changes. Build-time compilation can avoid shipping the original document and compiler, but this package provides no metadata-generation CLI. A build integration must preserve the compiler-produced artifact and its type; an arbitrary JSON cast does not prove that metadata matches the `paths` generic.

## Run the offline repository example

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run test/example.test.ts
pnpm typecheck
```

[complete-client.ts](../examples/complete-client.ts) exports `runExample()`, which the test calls using a deterministic mock transport. It demonstrates both clients, status-correlated results and runtime response validation, and returns `{ name: 'Ada', message: 'not found' }`. No public service or credentials are needed.

The declarations in [service-schema.d.ts](../examples/service-schema.d.ts) are already checked in. `pnpm test:generated` verifies all three generated fixtures; `pnpm generate:example` regenerates them when their source documents change.

## Next steps

- Add [authentication or cancellation](api.md#transport-authentication-and-cancellation).
- Learn the [response and error contract](api.md#responses-and-errors).
- Check [serialization and platform limits](support.md) before using forms or binary data.
- Use [troubleshooting](troubleshooting.md) for type, media and browser errors.
- Run repository and browser checks with the [development guide](development.md).
