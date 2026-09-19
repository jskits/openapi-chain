# openapi-chain

A tiny TypeScript OpenAPI client that turns a generated `paths` type into a fluent chain API with **zero generated client code**.

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });

const pet = await api.pets(42).get();
await api.pets.post({
  contentType: 'application/json',
  body: { name: 'Mochi' },
});
```

The package deliberately separates two runtime budgets:

- **core** (`openapi-chain`) is schema-free and guarded at **<= 2048 bytes gzip**. It covers the mainstream HTTP/OpenAPI path, query, header, cookie, JSON/text/native-body, transport and response flow while refusing to guess erased runtime metadata.
- **strict** (`openapi-chain/strict`) is opt-in. It consumes compiled OpenAPI metadata and implements exact `style`, `explode`, `allowReserved`, Parameter `content`, Encoding Object, multipart/form encoding, and OpenAPI 3.2 wire semantics.

This keeps the default client tiny without removing the long tail of the OpenAPI specification.

## Tiny core

The default client never loads the OpenAPI document and never generates endpoint runtime code.

```ts
const api = createClient<paths>({
  baseUrl: 'https://api.example.com',
});

await api.users(42).posts.get({
  query: { limit: 20 },
});
```

Because TypeScript types disappear at runtime, schema-free request bodies require an explicit concrete `contentType`:

```ts
await api.users.post({
  contentType: 'application/json',
  body: { name: 'Ada' },
});
```

The core bundle has a hard regression gate. `pnpm size:check` gzips the complete transitive ESM core and fails above 2048 bytes.

## Operation-derived typed extensions

Every method call exposes local escape hatches whose input and output types come from the **exact selected OpenAPI operation**.

```ts
await api.users(userId).post({
  query: { mode: 'fast' },
  contentType: 'application/json',
  body: { name: 'Ada' },
  extensions: {
    path: (value) => customPathValue(value),

    query: (query) => {
      // query is the exact query type for this POST operation.
      return customQuery(query);
    },

    header: (header) => customHeaders(header),
    cookie: (cookie) => customCookie(cookie),

    body: ({ body, contentType }) => {
      // body/contentType preserve the OpenAPI media-type correlation.
      // This callback always owns the WHOLE request body, never an inner form field/part.
      return customBody(body, contentType);
    },

    response: async (response) => {
      // status + data stay correlated with this operation's declared responses.
      // Runtime also verifies that status matches the actual HTTP response status.
      return { status: 200, data: await parseVendorResponse(response) };
    },

    request: (request, input) => {
      // Runs after validation and serialization. `input` stays OpenAPI-derived.
      return patchVendorRequest(request, input);
    },
  },
});
```

The extension API covers `path`, `query`, `querystring`, `header`, `cookie`, `body`, `response`, and the final `request`. The `body` extension owns the complete operation request body; it is never reused internally for an individual form field or multipart part. Response extensions return a status-correlated `{ status, data }` pair, and the runtime rejects a pair whose status differs from the actual HTTP response. This prevents a custom parser from destroying the public `status -> data` discriminated union.

Reusable extension objects can stay fully typed without adding runtime helpers:

```ts
import type { OperationExtensionsFor } from 'openapi-chain';

const extension = {
  response: async (response) => ({
    status: 200,
    data: { ok: true },
  }),
} satisfies OperationExtensionsFor<paths, '/jobs/{id}', 'get'>;
```

`$path()` remains the structural escape hatch for paths that cannot be represented losslessly as a JavaScript property chain:

```ts
await api.$path('/reports/{id}.json', { id: 'monthly' }).get();
```

## Exact wire mode

When an application needs OpenAPI serialization metadata that cannot survive type erasure, use the separate strict entry point:

```ts
import openapi from './openapi.json' with { type: 'json' };
import { createStrictClient } from 'openapi-chain/strict';
import { compileOpenAPIMetadata } from 'openapi-chain/metadata';
import type { paths } from './schema';

const metadata = compileOpenAPIMetadata(openapi);

const api = createStrictClient<paths>({
  baseUrl: 'https://api.example.com',
  metadata,
});

// Safe because strict runtime metadata proves the single media type.
await api.pets.post({ body: { name: 'Mochi' } });
```

`compileOpenAPIMetadata()` supports OpenAPI 3.0, 3.1, and 3.2 documents. Local JSON Pointer `$ref`s are resolved. External `$ref`s fail closed; bundle or dereference the document first.

### What strict mode validates

Strict mode checks declared routes, required parameter locations, request-body
presence/media and supported serialization rules. It is not a JSON Schema data
validator: enum/range constraints, response data, and undocumented response statuses
are not validated at runtime. TypeScript types assume the server follows its schema.
Use a response extension with an application validator when data must be checked.

Generate `paths` and compile metadata from the same version of the same document.
The compiled brand allows single-media inference; it does not prove that metadata
matches the `paths` generic. `defineOpenAPIMetadata` only labels an explicitly
partial table and does not grant the compiled brand required by `createStrictClient`.
Treat metadata as immutable after creating a client. Cookie headers are subject to
Fetch platform restrictions; browser authentication cookies use `init.credentials`
and server cookie policy rather than a manually authored Cookie header.

### Strict serialization coverage

| Surface                  | Supported behavior                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Path                     | `simple`, `label`, `matrix`, explode, safe `allowReserved`                                             |
| Query                    | `form`, `spaceDelimited`, `pipeDelimited`, `deepObject`, explode, `allowReserved`, Parameter `content` |
| Header                   | `simple`, explode, Parameter `content`                                                                 |
| Cookie                   | primitive `form`; OpenAPI 3.2 `cookie`; Parameter `content`; compound legacy `form` fails closed       |
| OpenAPI 3.2 query string | `in: querystring` with whole-query media serialization                                                 |
| Request body             | JSON, text, native binary, `application/x-www-form-urlencoded`, `multipart/form-data`                  |
| Encoding Object          | content defaults plus `style` / `explode` / `allowReserved` overrides                                  |
| Responses                | exact status, `nXX` wildcard, then `default`                                                           |
| HTTP methods             | Standard OpenAPI fixed methods including OpenAPI 3.2 `QUERY`                                           |

Strict mode also supports the same operation-derived `extensions` object. A local extension wins over the built-in strict serializer for that request, so vendor-specific behavior does not require forking the client.

## Fail-closed behavior

The implementation prefers an explicit error over silently sending the wrong wire representation. Examples include:

- schema-free structured bodies without an explicit media type;
- complete metadata missing the invoked route/method or required input;
- external `$ref` without bundling/dereferencing;
- invalid style/location combinations;
- conflicting OpenAPI `query` and `querystring` inputs;
- advanced multipart features that native Fetch primitives cannot represent;
- compound cookie values using legacy `style: form`, whose RFC6570 delimiter is not a faithful `Cookie` header representation.

Request processing runs in this order: input validation → location/body serialization →
`extensions.request` → transport → response parsing. The final request extension and
transport only receive successfully serialized requests; they cannot recover an
earlier validation or serialization failure. Use `extensions.body` or the relevant
location extension for unsupported encodings, then optionally patch the final
request. Required and undeclared input checks still apply in strict mode.

## Error modes

By default, non-2xx responses throw `HttpError` and successful response data is returned directly.

```ts
const value = await api.users(42).get();
```

Set `throwOnError: false` for a discriminated result union for successfully parsed HTTP responses:

```ts
const api = createClient<paths>({ baseUrl, throwOnError: false });
const result = await api.users(42).get();

if (result.ok) {
  console.log(result.status, result.data);
} else {
  console.error(result.status, result.data);
}
```

`throwOnError` controls HTTP status handling only. Network/transport failures,
AbortSignal cancellation, invalid JSON, serialization errors and extension errors
still reject the promise in either mode. Parsing happens before HTTP status
handling, so a malformed JSON error response rejects with its parsing error rather
than `HttpError`. Catch these failures separately from checking `result.ok`.

Response typing follows OpenAPI precedence: exact status > `nXX` wildcard > `default`. Empty `content` / `content: never` responses are typed as `undefined`.

## Type-safety details

The path tree is built per operation rather than flattening all paths into one coarse node. This preserves:

- shared dynamic prefixes with different parameter types;
- operation-level path parameter overrides;
- branch correlation after a dynamic path value is supplied;
- required/optional request bodies and `contentType` ↔ `body` correlation;
- strict single-media inference only when compiled runtime metadata actually exists;
- operation-specific extension input/output types.

## Transport

The tiny core keeps global customization intentionally small. Use `transport` for authentication, retry, tracing, caching, mocks, or platform adapters:

```ts
const api = createClient<paths>({
  baseUrl,
  transport: async (request) => {
    const headers = new Headers(request.init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(request.url, { ...request.init, headers });
  },
});
```

The strict entry additionally retains middleware composition for users who need it.

## Development

Use Node.js **24.16.0** (see `.node-version`) and **pnpm 10.34.5**.
CI also checks Node.js 22.22.1 and 26, plus Windows and macOS on Node.js 24.

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install
pnpm check
```

If your Node.js installation does not include Corepack, install pnpm 10.34.5 using
the [pnpm installation guide](https://pnpm.io/installation).

| Command                                     | Purpose                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                  | Rebuild the library on changes                                          |
| `pnpm build`                                | Build ESM, CommonJS, declarations and source maps; run publint and attw |
| `pnpm lint` / `pnpm lint:fix`               | Oxlint checks, including type-aware rules; optional fixes               |
| `pnpm format` / `pnpm format:check`         | Format or check using Oxfmt                                             |
| `pnpm typecheck`                            | Strict TypeScript checks for source, tests, examples and TS configs     |
| `pnpm test` / `pnpm test:watch`             | Run Vitest once or in watch mode                                        |
| `pnpm test:coverage`                        | Run tests with V8 coverage and 90% thresholds                           |
| `pnpm test:package` / `pnpm verify:package` | Verify all three entries in an isolated tarball consumer                |
| `pnpm size:check`                           | Enforce the 2048-byte transitive core gzip limit after building         |
| `pnpm check`                                | Run the complete local quality gate, including a fresh build            |
| `pnpm commit`                               | Create a Conventional Commit using Commitizen                           |
| `pnpm changeset`                            | Describe a user-facing change and its version impact                    |
| `pnpm version:packages`                     | Apply changesets and update the lockfile                                |
| `pnpm clean`                                | Remove build and coverage output                                        |

`test:package` needs `pnpm build` first. It packs and installs the package in a
temporary directory, verifies the file allowlist, and checks ESM/CJS imports plus
NodeNext declaration resolution for core, strict and metadata, typed operations, and mocked requests. It does not publish anything.

## Project conventions

- Add public exports in `src/index.ts`; put behavior tests in `test/*.test.ts`.
- Use explicit `.js` extensions for relative TypeScript imports under NodeNext.
- Keep runtime dependencies deliberate; there are currently none.
- TypeScript is pinned to 6.0.3 because tsdown reports its TypeScript 7 API integration
  as experimental. Upgrade after validating declaration output and consumers.
- Only `dist`, package metadata, README, license and an optional changelog ship to npm.
- `pnpm install` installs Husky hooks. Pre-commit runs lint-staged; commit-msg runs
  commitlint. The full type-aware check runs in `pnpm check` and CI.
- `sideEffects: false` assumes library modules do not perform import-time side effects.
  Update the declaration if future modules require them.
- Dependency lifecycle scripts are denied by default. Review and explicitly allow
  any future dependency that needs a build script in `pnpm-workspace.yaml`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor and release workflows.

## Release setup

Changesets v3 and its v2 GitHub Actions manage version PRs, changelogs, package
artifacts, npm publication and GitHub releases. The workflow separates verification,
packing and publication; only the publishing job has an OIDC permission.

Before enabling `.github/workflows/release.yml`:

1. Review the pending initial API changeset for the first `0.1.0` release.
2. Confirm ownership of the npm package name `openapi-chain`. If the package does
   not exist, create its first release with an authenticated maintainer account.
   For a local first publish, use `npm publish --provenance=false` after `pnpm check`.
3. Configure an npm **Trusted Publisher** with organization/user `jskits`, repository
   `openapi-chain`, workflow `release.yml`, and no environment name.
4. In GitHub Actions settings, enable **Allow GitHub Actions to create and approve
   pull requests**. Add a repository variable `RELEASE_ENABLED` with value `true`.

Once enabled, pushing changesets to `main` creates or updates a release PR.
Merging the release PR triggers the full CI matrix before packaging and publishing.
No long-lived npm token is needed for this OIDC workflow. Enable releases only after package ownership and Trusted Publishing are configured.

PRs created using GitHub's default token do not automatically start other workflows.
If branch protection requires CI on the release PR, manually run CI on its branch
using `workflow_dispatch`, or configure a GitHub App token for the version action.

Reference: [Changesets automation](https://changesets.dev/guide/automating),
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[tsdown package validation](https://tsdown.dev/options/lint).

## License

[MIT](./LICENSE)

## Response parsing contract

The default parsers differ intentionally to keep the core small:

| Response                             | Core default                  | Strict default                         |
| ------------------------------------ | ----------------------------- | -------------------------------------- |
| 204, 205, 304 or `Content-Length: 0` | `undefined`                   | `undefined`                            |
| JSON media                           | Parsed JSON                   | Parsed JSON                            |
| Text media                           | Text, or `undefined` if empty | Text, or `undefined` if empty          |
| Other media                          | Text, or `undefined` if empty | `ArrayBuffer`, or `undefined` if empty |

Strict also treats XML and form-urlencoded response media as text. Both parsers
buffer the body and consume the original `Response`; `result.response` is still
useful for status and headers but its body is usually already read. For binary,
streaming, or vendor responses, supply an operation `extensions.response` and
align the generated schema's data type with that parser's output. The library does
not transform a generated binary `string` type into `Blob` or `ArrayBuffer`.

A response extension receives the unread Response and returns `{ status, data }`.
Check the actual status before selecting its corresponding data shape. It may
return a stream without buffering when that stream is the operation's declared
data type. Use the same extension in both modes when migrating between clients.
