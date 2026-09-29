# Wire comparison with openapi-fetch

[Documentation index](README.md) · [Support matrix](support.md) · [Performance](performance.md)

An OpenAPI document declares more than types. Parameter `style`, `explode`, `allowReserved` and `content`, the request body media type and Encoding Objects all decide the bytes a server receives. This page shows what openapi-chain's strict client and openapi-fetch 0.17.0 actually send for the same operation and the same input.

Every row is executed and asserted by [`test/wire-comparison.test.ts`](../test/wire-comparison.test.ts). Run `pnpm vitest run test/wire-comparison.test.ts`. The test pins openapi-fetch 0.17.0; if an upgrade changes one of its requests, the test fails and this page must be updated.

## Why the requests differ

openapi-fetch keeps no runtime copy of the schema. Its generated types describe values, but serialization uses built-in defaults and options that apply to a whole client or request: arrays default to form/explode, objects to `deepObject`, and bodies to JSON. That design keeps it very small (see [bundle sizes](performance.md#size)), and openapi-fetch documents custom `querySerializer`, `pathSerializer` and `bodySerializer` options for everything else.

openapi-chain's strict client compiles serialization metadata from the same document ([CLI](cli.md) or [`compileOpenAPIMetadata`](api.md)) and applies each parameter's and property's declared rules. The core `createClient` is schema-free like openapi-fetch, so it cannot infer these styles either; this comparison is about `openapi-chain/strict`.

## Method

- Each case compiles a one-operation OpenAPI 3.1 document for strict and calls openapi-fetch with the parameters and body its generated types accept. Where an openapi-fetch user would have to add a `Content-Type` header, the case adds it; otherwise openapi-fetch defaults apply.
- The expected request follows the OpenAPI 3.1.1 [style examples](https://spec.openapis.org/oas/v3.1.1.html#style-examples), default styles per location and Encoding Object rules. openapi-chain's request must equal it exactly.
- **Identical** means the same bytes. **Equivalent** means the difference disappears after percent-decoding or HTTP list whitespace normalization, so a conforming server reads the same values. **Different** means the server receives different data, a different media type, or no data.

Summary: of 20 cases, 1 is identical, 3 are equivalent and 16 are different. Common cases such as scalar parameters, form/explode arrays and JSON object bodies with `application/json` behave the same in both libraries and are not repeated here.

## Query parameters

| Declaration and input | OpenAPI request (openapi-chain) | openapi-fetch 0.17.0 | Verdict |
| --- | --- | --- | --- |
| `color` array, default style; `['blue','black','brown']` | `?color=blue&color=black&color=brown` | `?color=blue&color=black&color=brown` | Identical |
| `color` object, default style (form, explode); `{R:100,G:200,B:150}` | `?R=100&G=200&B=150` | `?color[R]=100&color[G]=200&color[B]=150` | Different |
| `color` array, `explode: false` | `?color=blue,black,brown` | `?color=blue&color=black&color=brown` | Different |
| `tags` array `explode: false` and `ids` array default, in one operation | `?tags=a,b&ids=1&ids=2` | `?tags=a&tags=b&ids=1&ids=2` | Different |
| `color` array, `style: pipeDelimited, explode: false` | `?color=blue%7Cblack%7Cbrown` | `?color=blue&color=black&color=brown` | Different |
| `color` array, `style: spaceDelimited, explode: false` | `?color=blue%20black%20brown` | `?color=blue&color=black&color=brown` | Different |
| `color` object, `style: deepObject` | `?color%5BR%5D=100&color%5BG%5D=200&color%5BB%5D=150` | `?color[R]=100&color[G]=200&color[B]=150` | Equivalent |
| `next` string, `allowReserved: true`; `'/a/b?c'` | `?next=/a/b?c` | `?next=%2Fa%2Fb%3Fc` | Equivalent |
| `filter` with `content: application/json`; `{status:'open',page:2}` | `?filter=%7B%22status%22%3A%22open%22%2C%22page%22%3A2%7D` | `?filter[status]=open&filter[page]=2` | Different |

The mixed row matters most. openapi-fetch's `querySerializer: { array: { explode: false } }` fixes `tags` but then sends `ids=1,2`; its object option is applied to every array in the request. Per-parameter rules need a hand-written serializer function for that operation.

## Path parameters

The operation is `GET /items/{id}`.

| Declaration and input | OpenAPI request (openapi-chain) | openapi-fetch 0.17.0 | Verdict |
| --- | --- | --- | --- |
| `id` array, `style: label`; `['3','4','5']` | `/items/.3,4,5` | `/items/3,4,5` | Different |
| `id` array, `style: matrix, explode: true`; `['3','4']` | `/items/;id=3;id=4` | `/items/3,4` | Different |
| `id` object, `explode: true`; `{role:'admin',firstName:'Alex'}` | `/items/role=admin,firstName=Alex` | `/items/role,admin,firstName,Alex` | Different |

openapi-fetch reads path styles from RFC 6570-like template modifiers such as `/items/{.id}`. OpenAPI path templates never contain those modifiers and generated `paths` keys are `/items/{id}`, so the Parameter Object's `style` is not applied without a custom `pathSerializer`.

## Headers and cookies

| Declaration and input | OpenAPI request (openapi-chain) | openapi-fetch 0.17.0 | Verdict |
| --- | --- | --- | --- |
| `X-Ids` header array; `['3','4','5']` | `x-ids: 3,4,5` | `x-ids: 3, 4, 5` | Equivalent |
| `X-Filter` header object, `explode: true`; `{role:'admin',firstName:'Alex'}` | `x-filter: role=admin,firstName=Alex` | `x-filter: [object Object]` | Different |
| `session` cookie parameter; `'abc'` | `cookie: session=abc` | No Cookie header | Different |

openapi-fetch 0.17.0 accepts `params.cookie` in its types but does not serialize it; set the Cookie header yourself where the platform allows it. Browsers restrict the Cookie header for both libraries.

## Request bodies

| Declaration and input | OpenAPI request (openapi-chain) | openapi-fetch 0.17.0 | Verdict |
| --- | --- | --- | --- |
| `text/plain` string `'hello'`; openapi-fetch call sets `Content-Type: text/plain` | `content-type: text/plain`, body `hello` | `content-type: text/plain`, body `"hello"` | Different |
| `application/merge-patch+json` object `{name:null}` | `content-type: application/merge-patch+json` | `content-type: application/json` | Different |
| `application/x-www-form-urlencoded` object `{name:'Ada Lovelace'}` | `name=Ada+Lovelace` | `content-type: application/json`, body `{"name":"Ada Lovelace"}` | Different |
| Form body with `tags` array and `address` object, `encoding.address.style: deepObject`; openapi-fetch call sets the form Content-Type | `name=Ada&tags=a&tags=b&address%5Bcity%5D=Paris` | `name=Ada&tags=a%2Cb&address=%5Bobject+Object%5D` | Different |
| `multipart/form-data` with object `metadata`, array `tags` and a PNG `file` with `encoding.file.contentType: image/png`; openapi-fetch call sets `Content-Type: multipart/form-data` | Parts: `metadata` as `application/json` `{"title":"Cat"}`, `tags=a`, `tags=b`, `file` as `image/png` | JSON body `{"metadata":{"title":"Cat"},"tags":["a","b"],"file":{}}` without a multipart boundary | Different |

Without a body serializer, openapi-fetch JSON-encodes every non-FormData body and labels it `application/json` unless the call overrides the header. With `application/x-www-form-urlencoded` it uses `new URLSearchParams(body)`, which flattens arrays with commas and stringifies nested objects. For multipart it expects the application to build a `FormData` itself; the Blob in this case is JSON-encoded as `{}`.

openapi-chain's multipart JSON part is a Blob so it can carry its `application/json` Content-Type; native FormData therefore gives it the filename `blob`. See [binary bodies and multipart parts](support.md#binary-bodies-and-multipart-parts) for this and other native FormData limits.

## Matching these requests with openapi-fetch

Every difference above can be removed in openapi-fetch by writing the serialization yourself:

| Difference | openapi-fetch remedy |
| --- | --- |
| One non-default query style for all parameters of a request | `querySerializer: { array: { style, explode } }` or `{ object: { style, explode } }` on the client or call |
| Different styles for different parameters, parameter `content`, `allowReserved` for one parameter | A `querySerializer` function for that operation |
| Path `label`, `matrix` or object `explode` | A `pathSerializer` function; template modifiers do not exist in generated path keys |
| Structured header values and cookie parameters | Serialize the values and set the headers yourself |
| Non-JSON media types, form bodies and multipart encoding | A `bodySerializer` that builds the string, `URLSearchParams` or `FormData` (with per-part Blobs), plus the matching `Content-Type` |

That is the trade-off: openapi-fetch stays schema-free and small, and each operation whose document declares non-default serialization needs code that restates the document. openapi-chain's strict client derives the same rules from the document at the cost of shipping compiled metadata and a larger runtime (8.6 KB gzip for strict against 2.5 KB for openapi-fetch; see [delivery measurements](performance.md#metadata-and-consumer-delivery)).
