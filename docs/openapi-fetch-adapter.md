# Use strict serialization with openapi-fetch

[Documentation index](README.md) · [Wire comparison](wire-comparison.md) · [Official CLI](cli.md)

`openapi-chain/openapi-fetch` keeps an existing openapi-fetch client and replaces only how its requests are encoded. Path, query, header and cookie parameters and request bodies follow the OpenAPI document through openapi-chain's strict serializer; openapi-fetch still owns call types, `{ data, error, response }` results, response parsing, middleware, `fetch` and client options.

Use it when an application already depends on openapi-fetch and some operations declare non-default styles, parameter `content`, form or multipart Encoding Objects, cookie parameters or non-JSON media types. The [wire comparison](wire-comparison.md) shows what changes: all 20 cases there are also sent through the adapter by [`test/openapi-fetch-adapter.test.ts`](../test/openapi-fetch-adapter.test.ts), and every adapted request equals the OpenAPI-specified one.

## Set up

Generate metadata with the [official CLI](cli.md). Its `ScopedPaths` type is ordinary openapi-typescript output and works as openapi-fetch's `paths` parameter:

```ts
import createClient from 'openapi-fetch';
import { withOpenAPISerialization } from 'openapi-chain/openapi-fetch';
import { metadata } from './generated/catalog/metadata.js';
import type { ScopedPaths } from './generated/catalog/scope.js';

const client = withOpenAPISerialization(
  createClient<ScopedPaths>({ baseUrl: 'https://api.example.com' }),
  { metadata },
);

// GET /items/.3,4,5?tags=a,b when the document declares label and explode: false.
const { data, error } = await client.GET('/items/{id}', {
  params: { path: { id: ['3', '4', '5'] }, query: { tags: ['a', 'b'] } },
});
```

`withOpenAPISerialization` returns the same client type. It works with any openapi-fetch version whose calls accept per-request `querySerializer`, `pathSerializer` and `bodySerializer` options; the repository tests 0.17.0. For a path-based client, wrap first: `wrapAsPathBasedClient(withOpenAPISerialization(createClient<ScopedPaths>(options), { metadata }))`.

Metadata and `paths` must come from the same document revision. Calls to paths or methods missing from complete metadata reject before transport, as the strict client does; a CLI scope therefore also limits which operations the adapted client can send.

## What the adapter changes

For `GET`, `PUT`, `POST`, `DELETE`, `OPTIONS`, `HEAD`, `PATCH`, `TRACE` and `request(method, …)`:

- Path and query parameters are serialized from their declared `style`, `explode`, `allowReserved` and `content`. openapi-fetch's `querySerializer` and `pathSerializer` options, on the client or the call, are replaced.
- Header and cookie parameters are serialized into request headers. Explicit call `headers` still override a header parameter of the same name, following openapi-fetch's precedence.
- A request body is encoded for its media type and Encoding Object, including form and multipart bodies; the call's `bodySerializer` is replaced. When an operation declares one concrete media type, it is used automatically. Otherwise choose one with the call's `Content-Type` header. The adapter always sets the body `Content-Type` and removes it for native FormData, so Fetch can add the multipart boundary.
- Invalid input rejects with `OpenAPIChainError` (code, `method` and `pathTemplate`) before openapi-fetch builds a request. Examples are a missing required path value, a media type the operation does not declare, or a structured value its style cannot represent.

Everything else is unchanged. Middleware receives the final encoded `Request` and the call's `schemaPath`; its `params` contain path and query values but not header or cookie values, which are already headers. Bodyless calls keep client-level headers, including a configured `Content-Type`.

## Costs and boundaries

- The adapter entry bundles the strict serializer: 24036 B minified, 7355 B gzip with the [size benchmark](performance.md#size) method, in addition to openapi-fetch and your metadata. Generate metadata at build time; see [delivery measurements](performance.md#metadata-and-consumer-delivery).
- The [support matrix](support.md) applies unchanged. Unsupported representations fail explicitly instead of falling back to openapi-fetch's defaults.
- Browsers restrict the Cookie header for every Fetch client.

## Other HTTP clients

`createRequestSerializer` from `openapi-chain/strict` is the client-independent part. Build it once per metadata value and call it per request:

```ts
import { createRequestSerializer } from 'openapi-chain/strict';
import { metadata } from './generated/catalog/metadata.js';

const serialize = createRequestSerializer(metadata);
const request = serialize({
  method: 'post',
  path: '/items',
  body: { name: 'Ada', tags: ['a', 'b'] },
});
// request.path: rendered path; request.query: encoded query without '?';
// request.headers: header/cookie parameters and Content-Type; request.body: BodyInit | undefined.
await fetch(`https://api.example.com${request.path}${request.query ? `?${request.query}` : ''}`, {
  method: 'POST',
  headers: request.headers,
  body: request.body,
});
```

`params` accepts `path`, `query`, `querystring`, `header` and `cookie` records, and `contentType` selects a media type when several are declared. The function throws the same `OpenAPIChainError` values as the strict client. It does not add a base URL, send the request or parse a response.
