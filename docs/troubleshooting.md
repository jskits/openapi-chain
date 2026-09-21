# Troubleshooting

[Documentation index](README.md) · [API reference](api.md) · [Support matrix](support.md)

## Generator installation fails with a TypeScript peer error

openapi-typescript 7.13.0 declares `typescript: ^5.x`. Installing it with TypeScript 6.0.3 under strict peer checking fails with `ERR_PNPM_PEER_DEP_ISSUES` unless your application configures the same scoped allowance used by this repository. Installing the library does not copy its workspace rules into your application. Follow [generator and TypeScript compatibility](getting-started.md#generator-and-typescript-compatibility) to allow this exact pair while keeping other peer checks enabled.

## A route or method is missing from the chain

Regenerate `paths` from the document used by your service and check the operation's exact spelling and parameter type. Operation-level parameter declarations override path-level declarations. A path parameter accepting a string needs `'42'`, not `42`.

Mixed templates (`/files/{id}.json`), reserved names (`get`, `then`, `$path`), trailing slashes and repeated leading slashes need the typed `$path()` API. Do not append chain segments after `$path()`.

## A body requires contentType

Core cannot read erased types: provide a concrete `contentType` next to `body`, even for a single JSON media type. `init.headers['content-type']` does not satisfy the core typed input. Strict inference requires compiler-produced metadata and one concrete declared media type; multiple choices/ranges need an explicit choice.

A structured form/multipart object needs strict serialization or an `extensions.body` callback that returns the complete encoded body. Do not solve missing serialization by setting a header alone. Leave multipart boundaries to Fetch when returning native FormData.

## Strict rejects a request before fetch runs

Check that the document declares the exact route, method, parameter locations and media type, and that required inputs are present. Generate types and compile metadata from the same revision. Recreate the client after changing metadata; routing is indexed at construction.

`extensions.request`, middleware and transport run after validation/serialization. Use a location or whole-body extension for an unsupported encoding. Extensions still cannot bypass strict required/undeclared input checks or a compiler error.

## An extension is skipped after switching to strict

Core invokes `extensions.query` when `query` is present, even if it is `{}`. Strict invokes query/querystring extensions only for records with at least one own enumerable key. Consequently, an extension that synthesizes a query from `query: {}` runs in core but is skipped in strict. Omitting the input skips it in both clients.

Pass the operation's declared query values to the serializer. For a URL adjustment independent of query input, use `extensions.request` after successful serialization. Do not add an undeclared dummy parameter: strict rejects it before calling the extension. Empty header/cookie records still invoke their configured callbacks in both modes; see [the full invocation contract](api.md#extension-invocation-conditions).

## Metadata compilation fails

Pass a parsed OpenAPI object, not a JSON/YAML string. Bundle or dereference external references first; local anchor fragments are not supported JSON Pointer references. Check the [reference and schema inference rules](support.md#reference-contexts).

Ambiguous route templates, conflicting inferred part media, non-inferable schema cycles, depth over 128 and excessive traversal work fail explicitly. Simplify the serialization schema or preprocess unsupported constructs. `defineOpenAPIMetadata` and a TypeScript cast do not replace compilation or validation.

## throwOnError: false still throws

That option changes HTTP status handling only. Transport/network errors, cancellation, serialization, parsing and extension failures still reject. Wrap the call in `try`/`catch` as well as inspecting `result.ok`. A malformed JSON error response fails during parsing before it can become an HTTP result.

## Response data is text, ArrayBuffer, or already consumed

Inspect the actual response Content-Type. Core uses text for non-JSON data; strict uses ArrayBuffer for non-JSON/non-text media. A missing Content-Type therefore has different defaults in the two clients. Default parsers consume the response body; reading `result.response.json()` again usually fails.

Use `extensions.response` for binary mapping, validation, another character encoding or streaming. It receives the unread response and must return the actual HTTP status with the appropriate data shape. Ensure generated types match that shape; OpenAPI binary strings do not automatically become Blob or ArrayBuffer.

## A browser omits Cookie or reports CORS errors

Fetch follows browser policy. For browser session cookies, pass `init: { credentials: 'include' }` and configure cookies and CORS on the server. A manual Cookie header, custom transport or `mode: 'no-cors'` does not grant access to protected response data. Chromium is tested; other browser engines require application verification.

## A path or charset is rejected

Whole `.`/`..` path segments, including encoded variants, would be normalized by Fetch and are rejected even with a path extension. Use another server route or identifier representation.

Automatically serialized strings use UTF-8. For another charset, provide correctly pre-encoded bytes where supported or own the encoding in an extension. Changing a Content-Type label never transcodes bytes. See [media and encoding behavior](support.md#media-recognition-and-text-encodings).

## An installed package has a different API

Check its installed version and entry exports against this checkout's `package.json`. The current source version is `0.0.0`; historical registry packages may use another API. Reproduce against a [locally built tarball](getting-started.md#install-this-checkout) before assuming a source example describes the version you installed.

For repository failures, start with [development checks](development.md#choose-the-right-check). For a bug report, include the version, entry point, runtime, generator version, minimal synthetic schema and expected/actual request or response. Use [GitHub Issues](https://github.com/jskits/openapi-chain/issues) for ordinary bugs and the [security process](../SECURITY.md) for vulnerabilities.

## A third-party document repeats a template hierarchy

OpenAPI forbids `/x/{id}` and `/x/{name}` in the same document, even if they have different HTTP methods. Compilation rejects this by default. Correct the source document when possible. If it cannot be changed, explicitly opt in:

```ts
const metadata = compileOpenAPIMetadata(document, { onAmbiguousTemplate: 'allow' });
```

This accepts only that document irregularity; it does not certify conformance or relax other compiler errors. Different-method chains resolve independently. Same-method ambiguous chains still throw before transport; use the exact typed `$path('/x/{name}', { name: '42' })` template to select its serialization rules. Unrelated routes remain available. This selects client metadata, not the server's routing behavior; verify the server's interpretation separately.
