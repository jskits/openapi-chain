# Getting started

## Run the qualified example in this repository

```sh
pnpm install --frozen-lockfile
pnpm generate:example
pnpm format
pnpm exec vitest run test/example.test.ts
pnpm check
```

`examples/complete-client.ts` demonstrates core and strict clients, parameter
inference, status-correlated results and runtime response validation. It uses a
local mock transport, so running it needs no public service or credentials.
`examples/service-schema.d.ts` is generated from `examples/service.openapi.json`,
and that same document feeds the strict metadata compiler. CI regenerates and
compares both this fixture and the larger Petstore fixture.

## Use the library in an application

Install a published version of `openapi-chain`, or build and pack this checkout
with `pnpm build && pnpm pack` and install the resulting tarball in your application.
The local checkout version is not proof that the same version exists on npm.

Generate types from your OpenAPI JSON or YAML document. The repository qualifies
openapi-typescript 7.13.0 with TypeScript 6.0.3:

```sh
pnpm add -D openapi-typescript@7.13.0
pnpm exec openapi-typescript ./openapi.json -o ./schema.d.ts
```

For the included items schema, the core API is:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const item = await api.items('42').get();
console.log(item.name);
```

Core request bodies need an explicit concrete `contentType`. Authentication,
retry policy and tracing belong in your transport. A transport receives the final
serialized URL and Fetch options; pass `request.init` through so cancellation and
credentials are retained.

For exact serialization, compile metadata from the same document that generated
`paths`:

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
  // Network, abort, serialization and parsing/validation failures.
  console.error(error);
}
```

Enable TypeScript `resolveJsonModule` for the JSON import, or load/parse the document
with your application's build tooling. Compiling metadata at build time can avoid
shipping the original OpenAPI document and compiler. Preserve its type in a typed
build artifact; do not assert unrelated or partial JSON to the compiled brand.

Follow the response validator in `examples/complete-client.ts` when server data
must be checked. Strict serialization alone does not validate response schemas.

## Additional qualification

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm benchmark
```

The browser test uses local servers on ephemeral loopback ports and real Chromium.
It covers multipart boundaries, Unicode, credentialed cross-origin requests,
Cookie omission, AbortSignal and streamed response extensions for both clients.
It does not qualify Firefox, WebKit, every proxy/server stack or npm publication.
See [performance methodology](performance.md) and [the support matrix](support.md).
