# Getting started

[Documentation index](README.md) · [API reference](api.md) · [Support matrix](support.md)

This guide uses the repository's [Items document](../examples/service.openapi.json): `GET /items/{id}` returns `{ id: string, name: string }` with status 200 or `{ error: string }` with status 404. Replace it with your own OpenAPI document to build your application's chain.

## Generator and TypeScript compatibility

We recommend **TypeScript 7.0.2** for application type checking, especially with large OpenAPI schemas. The repository continuously checks both TS 6.0.3 and TS 7.0.2, including installed ESM/CommonJS declaration consumers and type-performance fixtures. Keep using [path scoping](large-schemas.md): a faster compiler does not remove the cost of a large exposed route tree.

The generator `openapi-typescript@7.13.0` declares `typescript: ^5.x` and uses the compiler API. Our verified configuration keeps `typescript@6.0.3` for that API and installs TS 7 separately as `typescript7`. This avoids replacing the compiler API dependency with the native compiler. It does **not** claim the generator can run against TS 7's API. See the [official side-by-side explanation](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).

First merge this into your application's `pnpm-workspace.yaml`, preserving other settings. Repository peer rules are not inherited by downstream applications:

```yaml
strictPeerDependencies: true
peerDependencyRules:
  allowedVersions:
    'openapi-typescript>typescript': '6.0.3'
```

Then install the exact tested versions:

```sh
pnpm add -D --save-exact typescript@6.0.3 typescript7@npm:typescript@7.0.2 openapi-typescript@7.13.0
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
node node_modules/typescript7/bin/tsc --noEmit
```

In your application's package.json, use explicit compiler paths:

```json
{
  "scripts": {
    "typecheck": "node node_modules/typescript7/bin/tsc --noEmit",
    "typecheck:ts6": "node node_modules/typescript/bin/tsc --noEmit"
  }
}
```

Both compiler packages advertise a `tsc` binary. Do not rely on which one the package manager places in `.bin`; the commands above work without shell-specific environment assignments and select the intended compiler. The repository's `pnpm test:package:ts7` installs this setup into an isolated tarball consumer, runs the generator there and checks its output with the consumer's TS 7 compiler, including negative type assertions.

For editor speedups, enable your editor's **TypeScript 7 native language server** using its supported configuration. Installing the alias or running TS 7 on the command line does not automatically switch an editor still using TS 6 tsserver. Follow the editor guidance linked in the [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

The scoped peer allowance still permits only the generator's TS 6.0.3 pairing; it does not relax other peer checks or add TS 7 to the generator's allowed range. Framework integrations and other tools importing the compiler API need their own compatibility verification. TS 6 remains supported and checked; this recommendation is not a new minimum compiler requirement for all applications.

## Install a published package

After checking [generator compatibility](#generator-and-typescript-compatibility), install a published version with this API:

```sh
pnpm add openapi-chain
pnpm add -D --save-exact typescript@6.0.3 typescript7@npm:typescript@7.0.2 openapi-typescript@7.13.0
```

See the [runtime package manifest](../packages/core/package.json) for the source checkout version; these docs do not establish which API is available from the npm registry. Use the tarball route below to test this checkout. The generator is a development dependency, not a runtime requirement.

## Install this checkout

From the repository root, using [the development toolchain](development.md):

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:package
pnpm --dir packages/core pack --out /tmp/openapi-chain-local.tgz
```

Then, from a separate application directory with [generator compatibility](#generator-and-typescript-compatibility) configured:

```sh
pnpm add /tmp/openapi-chain-local.tgz
pnpm add -D --save-exact typescript@6.0.3 typescript7@npm:typescript@7.0.2 openapi-typescript@7.13.0
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

For an existing core application, follow the [migration guide](migration.md) before replacing the client. The call shape is shared, but serialization, validation and binary parsing can change.

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

Treat metadata as immutable and recreate the client when its schema changes. For build-time generation, the separate [`@openapi-chain/cli`](cli.md) package generates types, a selected path scope, and metadata from the same local OpenAPI 3.0/3.1 document. That workflow keeps the document and compiler out of the browser bundle. The manual compiler shown here also supports OpenAPI 3.2 metadata, but its output must be paired with types generated from the same document; an arbitrary JSON cast does not prove that pairing.

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
