# API reference

[Documentation index](README.md) · [Getting started](getting-started.md) · [Support matrix](support.md)

Examples using `./schema.js` and `./openapi.json` refer to the [Items schema](../examples/service.openapi.json), unless stated otherwise. The public declarations in [src/type.ts](../src/type.ts) define the full type API.

## Entry points

| Import | Runtime exports | Purpose |
| --- | --- | --- |
| `openapi-chain` | `createClient`, `HttpError`, `httpMethods` | Schema-free client and shared public types |
| `openapi-chain/strict` | `createStrictClient` | Metadata-driven client and selected operation types |
| `openapi-chain/metadata` | `compileOpenAPIMetadata`, `defineOpenAPIMetadata` | Metadata compiler and metadata types |

Import `HttpError`, `Transport` and `Middleware` from the root entry, including when using a strict client. All three entries have ESM and CommonJS exports. Use `import type` for declarations.

## Client options

`createClient<paths>(options)` and `createStrictClient<paths>(options)` return a fluent API derived from the `paths` type.

| Option | Core | Strict |
| --- | --- | --- |
| `baseUrl` | Required string; may include a service path prefix | Same |
| `headers` | `HeadersInit` defaults | `HeadersInit` or a sync/async function returning it per request |
| `fetch` | Fetch replacement; defaults to `globalThis.fetch` | Same |
| `transport` | `(request: TransportRequest) => Promise<Response>`; takes precedence over `fetch` | Same |
| `throwOnError` | Defaults to `true`; literal `false` selects the result union | Same |
| `metadata` | Not accepted | Required `CompiledOpenAPIMetadata` |
| `middleware` | Not accepted; compose a transport instead | Array of `Middleware` functions |

Use `CoreClientOptions` or `StrictClientOptions` to type reusable options. `ClientOptions` is a broader shared contract and does not mean every option is accepted by core. A nonliteral boolean `throwOnError` produces a union of both return modes; keep it literal when you want a single return shape.

The client does not select an OpenAPI server, execute security schemes, retry, cache or validate JSON Schema data automatically. Clients need standard Fetch classes such as `Headers`, `Response`, `Blob` and `FormData`, even with a custom transport.

## Paths and methods

For `GET /items/{id}`, the following calls select the same operation:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
await api.items('42').get();
await api.$path('/items/{id}', { id: '42' }).get();
```

Each dynamic node takes exactly one parameter. Parameter types and operation-level overrides remain tied to the selected route. Nodes are reusable; only calling an HTTP method sends a request. Methods are lowercase: `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`, `query`, and only declared operations appear in the generated API. Fetch platforms can still reject particular methods or bodies.

Use `$path(template, params)` for mixed templates such as `/reports/{id}.json`, segments named `get` or `then`, and paths whose trailing or repeated slashes cannot be expressed by the chain. Templates must be declared keys in `paths`; they are not arbitrary untyped URLs. A `$path()` result is terminal: call its HTTP method without appending more segments. The root `/` can use a root method such as `api.get()` when declared.

Whole `.` and `..` segments, including encoded spellings, fail before transport because Fetch would normalize them. This also applies to path extensions.

## Request inputs and bodies

Method inputs are derived from the exact operation. Required parameter locations and request bodies make the input argument required.

| Field         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `query`       | Declared query parameters                                                     |
| `header`      | Declared header parameters; singular field name                               |
| `cookie`      | Declared cookie parameters, subject to platform restrictions                  |
| `querystring` | Strict-only OpenAPI 3.2 whole-query input; cannot coexist with `query`        |
| `body`        | Body value correlated with the selected media type                            |
| `contentType` | Concrete media type; required by core for a supplied body                     |
| `init`        | Fetch options such as `signal`, `credentials`, `cache` and additional headers |
| `extensions`  | Operation-specific serialization, response or request callbacks               |

Path parameters belong in the chain or `$path()` argument, not the method input. `init.method` and `init.body` are excluded from the public input; use the operation and `body` fields. `init.headers` is useful for authentication headers absent from the schema. Header precedence is client defaults → declared `header` values → `init.headers`, followed by cookie/body serialization. Body serialization can set Content-Type; native FormData removes it so Fetch can generate the boundary.

The next example uses the repository's [Petstore schema](../examples/example.yaml), generated as `petstore-schema.d.ts` in your application:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './petstore-schema.js';

const api = createClient<paths>({ baseUrl: 'https://petstore3.swagger.io/api/v3' });
await api.pet.findByStatus.get({ query: { status: 'available' } });
await api.pet.post({
  contentType: 'application/json',
  body: { name: 'Mochi', photoUrls: [] },
});
```

Core serializes JSON, scalar text and supported native bodies. For structured URL-encoded or multipart objects, supply a whole-body extension or use strict. Core query defaults skip nullish values, repeat array keys and expand object keys into query entries; nested schema-specific encoding needs an extension or strict. It cannot infer OpenAPI `style`, `explode` or `allowReserved` from erased types.

Strict can omit `contentType` when compiled metadata and the operation type both establish one concrete media type. Multiple media types or media ranges require an explicit concrete selection. A body extension does not remove this requirement. See [binary and multipart support](support.md#binary-bodies-and-multipart-parts) for byte slices, filenames and encoding limits.

## Responses and errors

With the default `throwOnError: true`, a parsed 2xx response returns its data. Other parsed HTTP responses throw `HttpError`, with `status`, `data` and `response`:

```ts
import { createClient, HttpError } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
try {
  await api.items('missing').get();
} catch (error) {
  if (error instanceof HttpError) console.error(error.status, error.data);
  else throw error;
}
```

Caught error data is `unknown` unless you validate or narrow it; a catch clause cannot infer the operation's response type. Use `throwOnError: false` for a status-correlated `{ ok, status, data, response }` union:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({
  baseUrl: 'https://api.example.com',
  throwOnError: false,
});
const result = await api.items('42').get();
if (result.status === 200) console.log(result.data.name);
else console.error(result.data.error);
```

These types assume the response follows the document. Matching precedence is exact status → `nXX` wildcard → `default`. Undocumented statuses and invalid data are not rejected by default. Empty `content` or `content: never` responses are typed as `undefined`.

Both modes reject for transport failures, cancellation, invalid JSON, serialization errors and extension errors. Parsing happens before HTTP status handling, so a malformed JSON error response rejects with the parser error instead of `HttpError`.

| Response                                        | Core default | Strict default |
| ----------------------------------------------- | ------------ | -------------- |
| 204, 205, 304 or `Content-Length: 0`            | `undefined`  | `undefined`    |
| Nonempty JSON media                             | Parsed JSON  | Parsed JSON    |
| Nonempty `text/*`, XML or form-urlencoded media | Text         | Text           |
| Other nonempty media, including no Content-Type | Text         | `ArrayBuffer`  |
| Empty body                                      | `undefined`  | `undefined`    |

Media matching ignores parameters and recognizes JSON `+json` and strict XML `+xml` suffixes. See [charset behavior](support.md#media-recognition-and-text-encodings). Default parsers buffer and consume the original response. `result.response` and `HttpError.response` still expose headers and status, but their bodies are usually already read. A response extension receives the unread response and replaces parsing, including the empty-body defaults.

Generated binary `string` types are not automatically converted to `ArrayBuffer`, `Blob` or streams. Align your generator's type mapping and response extension with the actual data your application consumes.

## Extensions

Every method accepts local callbacks derived from that operation. Serialization callbacks are synchronous; only `request` and `response` may return promises.

| Extension | Input | Output |
| --- | --- | --- |
| `path` | Path parameter value and `{ index }` (zero-based dynamic segment) | Encoded path fragment |
| `query` | Exact query record | Encoded query string or `URLSearchParams` |
| `querystring` | Whole-query record (strict) | Encoded query string or `URLSearchParams` |
| `header` | Exact header record | `HeadersInit` |
| `cookie` | Exact cookie record | Cookie header string |
| `body` | Correlated `{ body, contentType }` | Whole `BodyInit` or `undefined` |
| `request` | Serialized `TransportRequest` and typed operation input | Final `TransportRequest` |
| `response` | Unread `Response` | Status-correlated `{ status, data }` |

### Extension invocation conditions

For valid typed inputs, a configured extension runs under the following conditions, provided earlier request processing has succeeded:

| Extension | Core | Strict |
| --- | --- | --- |
| `path` | Once per dynamic path value or template placeholder occurrence | Same |
| `query` | When `query` is provided, including `{}` | Only when `query` has at least one own enumerable key |
| `querystring` | Not supported | Only when `querystring` has at least one own enumerable key |
| `header`, `cookie` | When the corresponding record is provided, including `{}` | Same, after strict input validation |
| `body` | When `body !== undefined` and a content type is supplied | When `body !== undefined`, after required-input and media checks |
| `request` | After request serialization succeeds | Same, before middleware |
| `response` | After transport returns a response | After middleware/transport returns a response |

For example, with `query: {}` and a query extension returning `q=custom`, core appends `?q=custom`, while strict skips the extension and leaves the query unchanged. Omitting `query` skips that extension in both clients. In strict mode, `{ q: undefined }` still has a key and reaches the extension if `q` is declared and optional; the extension owns how it handles that value. Required and undeclared parameter checks run before strict extensions.

When migrating to strict, supply the declared query values that the serializer needs rather than relying on an empty record to trigger it. Use `extensions.request` for a final URL adjustment that does not depend on a query record; it still cannot bypass earlier validation or serialization failures. See [troubleshooting](troubleshooting.md#an-extension-is-skipped-after-switching-to-strict).

Encoded strings are owned by the callback; do not expect a second escaping pass. The body callback always owns the entire body, never an inner form field or multipart part.

### Reusable extensions

A reusable request extension for the Items operation:

```ts
import { createClient, type OperationExtensionsFor } from 'openapi-chain';
import type { paths } from './schema.js';

const traced = {
  request: (request) => {
    const headers = new Headers(request.init.headers);
    headers.set('x-request-id', crypto.randomUUID());
    return { ...request, init: { ...request.init, headers } };
  },
} satisfies OperationExtensionsFor<paths, '/items/{id}', 'get'>;

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
await api.items('42').get({ extensions: traced });
```

`OperationInputFor<paths, Path, Method>` names the corresponding method input. Both `OperationInputFor` and `OperationExtensionsFor` accept a fourth generic `true` for strict single-media inference; the default is core behavior.

For validated parsing, copy the complete status-aware validator in [complete-client.ts](../examples/complete-client.ts). A response extension must check the actual status before choosing its data shape. Runtime verifies that its returned status equals `response.status`; a mismatch rejects the request. A streaming extension can return an unread stream when the operation declares that data type.

The request lifecycle is:

1. Resolve the operation and, in strict mode, validate required/declared inputs.
2. Serialize path, parameter locations and body, using local extensions where supplied.
3. Run `extensions.request`.
4. Run strict middleware, if configured, and the transport.
5. Run `extensions.response` or the default parser.
6. Return data/result or throw for the HTTP status.

A final request extension, middleware or transport cannot recover an earlier validation/serialization failure. Replace the relevant location or whole-body serializer instead. Strict required/undeclared input checks still apply.

## Transport, authentication and cancellation

A transport receives `{ url, method, init }`. `method` is lowercase; `init.method` is the uppercase Fetch method. Preserve the supplied `init` options so headers, request bodies, cancellation and credentials survive wrapping:

```ts
import { createClient, type Transport } from 'openapi-chain';
import type { paths } from './schema.js';

function authenticatedTransport(getToken: () => Promise<string>): Transport {
  return async ({ url, init }) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${await getToken()}`);
    return fetch(url, { ...init, headers });
  };
}

export function createAuthenticatedClient(getToken: () => Promise<string>) {
  return createClient<paths>({
    baseUrl: 'https://api.example.com',
    transport: authenticatedTransport(getToken),
  });
}
```

For a static token, client `headers` also works. Strict additionally supports an async header factory. Browser session cookies use `init.credentials` and server cookie/CORS policy, not a manually authored Cookie header:

```ts
import { createClient } from 'openapi-chain';
import type { paths } from './schema.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const controller = new AbortController();
const pending = api.items('42').get({
  init: { signal: controller.signal, credentials: 'include' },
});
controller.abort();
try {
  await pending;
} catch (error) {
  console.error(error); // Native Fetch normally rejects cancellation with AbortError.
}
```

Strict middleware has the shape `(request, next) => Promise<Response>` and wraps the transport in array order: `[a, b]` runs `a → b → transport`, with responses returning through `b → a`. A middleware may return a response without calling `next`; it still runs after request validation/serialization. Retries are your policy: account for operation idempotency and whether bodies can be replayed.

## Metadata compilation

`compileOpenAPIMetadata(document: unknown)` returns `CompiledOpenAPIMetadata` or throws for unsupported/ambiguous compilation inputs. It extracts serialization hints from OpenAPI 3.0/3.1/3.2; it is not a full OpenAPI or JSON Schema validator. See [schema inference](support.md#schema-inference-matrix) for references, composition, recursion and work limits.

`defineOpenAPIMetadata(metadata)` returns its input unchanged and types it as `OpenAPIMetadata`. It does not compile, validate, freeze, or brand a table. It does not meet `createStrictClient`'s required compiled type. Use the compiler for strict clients rather than asserting a hand-written table to the compiled brand.
