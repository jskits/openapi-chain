# Supported behavior and boundaries

[Documentation index](README.md) · [API reference](api.md) · [Troubleshooting](troubleshooting.md)

This is the maintained serialization contract. For usage, start with the [getting-started guide](getting-started.md); dated evidence lives in the [qualification archive](archive/qualification/README.md).

| Surface | Core | Strict |
| --- | --- | --- |
| Fluent path tree | Operation-derived types, scalar path encoding | Same type model with metadata-driven path encoding |
| Mixed templates and reserved segment names | Typed `$path()` | Method names can be segments at nonconflicting nodes; `$path()` for remaining conflicts |
| Query objects/arrays | Schema-free defaults or local extension | OpenAPI form, delimited and deepObject styles |
| Whole-query `querystring` | Not supported by the core typed input | OpenAPI 3.2 metadata and extension support |
| Headers/cookies | Basic serialization or extension | Metadata-driven styles/content; browser restrictions still apply |
| JSON/text/native request bodies | Explicit contentType | Single-concrete-media inference when metadata proves it |
| Structured URL-encoded/multipart body | Whole-body extension | Encoding Objects and supported native Fetch representations |
| Vendor wire behavior | Location/body extensions, then final request/transport | Same order; metadata validation precedes serialization |
| Client headers | Static HeadersInit; functions rejected | Static or per-request sync/async function |
| Middleware | Implement in transport | Middleware composition and transport |
| Response parsing | JSON/text defaults | JSON/text/binary defaults |
| Streaming | Explicit response extension and matching declared data type | Same |
| Runtime JSON Schema validation | Application responsibility | Application responsibility |
| Runtime response status/data validation | Extension status must match actual response; schema data not validated | Same |
| Metadata compilation | Not loaded | Separate compiler for 3.0/3.1/3.2 serialization metadata |
| External references | No document processing | Rejected: bundle/dereference first |
| Recursive schemas | No document processing | Ordinary object recursion is allowed; non-inferable serialization cycles and depth over 128 fail explicitly |

See [extension invocation conditions](api.md#extension-invocation-conditions) for the differences between omitted, empty and populated query inputs.

## Platform and type boundaries

The public type model supports fixed OpenAPI methods, including QUERY. Actual Fetch implementations can reject methods such as TRACE and GET/HEAD bodies. A custom transport must itself support any operation native Fetch cannot send. Browser Cookie headers, CORS and credentials follow browser policy; use credentials and server-set cookies for browser sessions.

Paths containing whole literal or encoded dot segments are rejected. Native Fetch would normalize them and change the endpoint. Use `$path()` for `then`, `$path`, mixed templates and repeated slashes. Core reserves all HTTP method names as segments. Strict allows a method name such as `query` as a segment when metadata declares that child path and the current node has no operation of that name; otherwise the operation takes priority. Core also requires `$path()` for trailing slashes (except the root `/`). Strict supports one trailing slash when its metadata identifies a unique template for the selected method. If `/items` and `/items/` both declare GET, use `$path()` to choose; GET `/items` and POST `/items/` can use the chain independently. Strict hides ambiguous methods from chain types and rejects ambiguous calls before transport. Exact `$path()` calls preserve slash structure.

Generated binary types and actual parser values must agree. Use an operation response extension for binary/stream/vendor formats and configure your generator's type mapping accordingly. A generic `paths` parameter is not runtime validation.

Metadata analysis caches shared schema subgraphs within each compilation. A 1,000,000-step work budget bounds traversal in addition to the 128-level depth limit; exceeding either fails explicitly. Compile large documents at build time. Caches are discarded between compilations.

Compiled metadata and `paths` must come from the same schema revision. Treat metadata as immutable while a client is alive. Strict routing is indexed at client construction; replace the client when the routing document changes.

Advanced multipart per-part headers, ordered/nested encoding and content-transfer encodings that native FormData cannot represent are rejected or require a whole body extension. Arbitrary OpenAPI 3.2 additionalOperations are not supported.

OpenAPI 3.2 Media Type Object references are resolved before compiling body and parameter-content serialization, including whole-query `querystring` content. Local references retain the referenced schema and Encoding rules; external, missing and cyclic references fail compilation.

## Qualification scope

Local checks cover strict TypeScript, pinned real generator output, behavior and negative type tests, deterministic adversarial URL data, local HTTP, installed ESM/CJS tarballs, declaration resolution, coverage, core size and type-scale budgets. Chromium is a separate CI job. Node 22/24/26 and Windows/macOS/Linux are configured in the CI matrix; local success does not establish that those remote jobs passed.

This is a serialization support matrix, not a certification of every OpenAPI feature. Links, callbacks, webhooks, security-scheme execution, automatic auth, retry policy and complete schema validation are outside the client's built-in scope.

## Reference contexts

Reference Objects cannot override serialization fields through sibling keys. OAS 3.0 schema references follow that same rule; OAS 3.1/3.2 Schema Object `$ref` siblings are combined conjunctively. Path Item references preserve disjoint fields and reject overlapping fields, whose behavior OpenAPI leaves undefined. Summary/description annotations do not affect the compiled serialization metadata.

## Schema inference matrix

The compiler extracts serialization hints; it does not evaluate every JSON Schema keyword. Accepting a document is not a claim that every keyword influenced the result. This distinction matters most for multipart part defaults and form fields.

| Schema structure | Current inference | Application action |
| --- | --- | --- |
| Explicit string, number, integer or boolean | Primitive kind; text default for ordinary values | Use normal serialization for supported styles |
| Explicit object / properties | Object kind and JSON part default; named properties supply field metadata | Keep field serialization hints on named properties |
| Array with items | Array kind; default part media is inferred from items | Check the supported style and element representation |
| Compatible allOf branches | Combines named properties conjunctively and derives available kind/media hints | Prefer explicit wire-relevant types; this is not general constraint solving |
| Conflicting inferred allOf media without an explicit determining type | Compilation throws | Give a coherent serialization schema or preprocess the document; a runtime extension cannot recover a failed compilation |
| Local JSON Pointer references | Resolves against the OpenAPI document, including percent-encoded fragments | Bundle documents into this supported pointer form |
| OAS 3.0 schema reference siblings | Ignored | Put applicable schema constraints in an allOf branch |
| OAS 3.1/3.2 schema reference siblings | Conjunctive analysis, including repeated acyclic references | Repeated references are allowed; actual inference cycles still fail |
| Ordinary recursive object properties | Object can be represented as a JSON part | Validate recursive data separately if needed |
| Recursive allOf/items inference; excessive depth or work | Controlled compilation error | Simplify/preprocess the serialization schema |
| Nullable type array with one non-null type | Uses the non-null type for hints | Null-value serialization remains subject to the location/body serializer |
| Multiple non-null types in `type` | No kind or content-type hints are inferred; multipart/form and URL-encoded bodies require a whole-body extension | Applies through local references, `allOf`, and array items; explicit JSON serialization remains supported, including JSON selected from `application/*` or `*/*` |
| `oneOf`; `anyOf`; conditional schemas | No complete branch analysis | Do not depend on automatic media inference; provide explicit media/encoding and a whole-body extension where necessary |
| additionalProperties / patternProperties | No per-key schema inference for dynamic property names | Use named properties or a body extension for schema-dependent map encoding |
| enum, bounds, required object properties, formats and response schemas | Not a data-validation pass | Validate request/response data in application code |
| OAS 3.0 string format: binary | Binary part hint | Supply the supported binary body value |
| Multipart contentEncoding | Marks a named field for custom whole-body serialization | Use a body extension capable of the intended wire format |
| External references or local anchor fragments | Rejected when resolved | Bundle/normalize before compiling |
| $id resource scopes / $dynamicRef | No resource-scope or dynamic-reference evaluator | Normalize these constructs before relying on serialization inference |

An explicit `encoding.contentType` controls supported field/part serialization; it does not turn unsupported schema constructs into a validator or bypass compiler errors. When inference is uncertain, verify the actual request body against the server's expected wire format. Whole-body extensions run after strict input validation and take responsibility for the complete body representation.

## Binary bodies and multipart parts

Core and strict accept ArrayBuffer views (including Uint8Array, DataView and Node Buffer) for binary bodies. The view's byte offset and length are preserved; bytes outside a slice are not sent. Streaming request bodies still require an operation body extension and an appropriate Fetch implementation or transport.

Structured strict multipart bodies preserve File names when a declared part type requires replacing the File's media type. Arrays retain a separate part and name for each File. Anonymous Blob parts retain native FormData's default filename.

Native FormData, including the result of a body extension or strict structured multipart serialization, requires an unparameterized `multipart/form-data` selection. Fetch generates its own boundary and would drop any selected media parameters. Incompatible media types and explicit multipart parameters fail before transport. A whole-body extension returning encoded bytes or text can supply the exact representation and matching header instead.

An Encoding Object's single unparameterized media range, such as `image/*` or `*/*`, is resolved from each Blob/File's matching concrete type. Missing, nonmatching or wildcard Blob types, parameterized ranges and multiple declared choices require explicit application serialization. Ranges are never emitted as part Content-Type values.

Generated textual multipart parts use UTF-8. Explicit `charset=utf-8` (including quoted, case-insensitive spelling) is supported and retained; other charsets fail before transport. Pre-encoded Blob/ArrayBuffer/view values can carry another charset without re-encoding their bytes. The application is responsible for that encoding. A whole-body extension can also implement another character encoding.

Plain `text/plain` string parts remain normal form fields. Explicit media parameters require a Blob-backed part to retain its Content-Type; native FormData adds a filename to such parts. If the server requires a parameterized text part without a filename, use a whole-body extension to supply that exact representation. Style-based encodings follow their separate OpenAPI rules and ignore contentType.

Quoted commas in Encoding `contentType` parameter values remain part of one media declaration. Native Blob lowercases its type and cannot preserve every parameter value, so strict rejects case-sensitive values that would change and non-ASCII values that would be discarded. Case-insensitive charset spelling remains supported. Use a whole-body extension for part headers that native Blob cannot represent. See the [File API type conversion](https://w3c.github.io/FileAPI/#constructorBlob).

## Media recognition and text encodings

Default response parsing classifies the normalized media type before its semicolon-separated parameters. JSON parsing applies to `application/json` and `+json` suffix types; parameter values containing `json` or `xml` do not select a parser. Strict uses text for `text/*`, `application/xml`, `+xml` and `application/x-www-form-urlencoded`, and ArrayBuffer for other nonempty bodies. Core retains its text fallback. JSON sequences and other streaming formats need a response extension. Default text decoding follows Fetch's UTF-8 `text()` behavior; use a response extension for another response encoding.

Automatically generated request strings use UTF-8 across core, strict, JSON, text, form encoding and supported parameter-content serialization. A declared non-UTF-8 charset is rejected before transport. Quoted and case-insensitive UTF-8 labels are accepted; unrelated quoted parameters do not select a charset. Pre-encoded Blob/ArrayBuffer/view bodies remain byte-preserving, including under text media types. Body and location extensions retain responsibility for their chosen encoding. Merely changing a Content-Type header never transcodes bytes.

Core assumes the standard Fetch body classes supplied by supported Node versions and modern browsers, including when an application replaces the transport.

## Strict serialization styles

| Location | Built-in behavior |
| --- | --- |
| Path | `simple`, `label`, `matrix`, explode and safe reserved expansion |
| Query | `form`, `spaceDelimited`, `pipeDelimited`, `deepObject`, explode, `allowReserved`, Parameter `content` |
| Header | `simple`, explode and Parameter `content` |
| Cookie | Primitive `form`, OpenAPI 3.2 `cookie`, Parameter `content` |
| Query string | OpenAPI 3.2 `in: querystring` whole-query media serialization |
| Body | JSON, text, supported binary/native values, structured URL-encoded and multipart bodies |
| Encoding Object | Supported content defaults and `style` / `explode` / `allowReserved` overrides |

Styles still impose value-shape constraints; this table does not promise arbitrary nested object encoding. Compound legacy cookie `form` values fail because the style's delimiter cannot faithfully represent a Cookie header. Invalid style/location combinations and unsupported representations fail explicitly. Use an operation-local extension where the application owns the exact wire format.

Strict validates required parameter locations, body presence, declared inputs and supported media. It does not validate enum/range constraints, required properties inside body objects, response data or undocumented response statuses. A response extension can add application validation; see the [response contract](api.md#responses-and-errors).

## Choosing core and migrating to strict

Follow the [staged migration guide](migration.md) and [offline comparison workflow](migration-check.md). Verify the operations you actually use; do not infer compatibility from a document percentage or wait for core to fail.

Core rejects `middleware`, `metadata` and function-valued `headers` at construction, including JavaScript callers. Use `@openapi-chain/core/strict` for these options; core applications can implement authentication and middleware in their transport. Explicit `undefined` is equivalent to omitting an option.

Absence of non-default `style` or `explode` is not proof of core compatibility. Check parameter location and value shape as well: a default simple object header requires `a,b` for `{ a: 'b' }`, whereas core's schema-free coercion produces `[object Object]`. Scalar path encoding, compound cookies, body encoding and response parsing also need review. A keyword search is only an initial screen.

When migrating, compile metadata from the same schema revision as the generated types, then check required/undeclared inputs, media selection, wire encodings and response consumers. Core requires explicit body contentType; strict can infer a single concrete declared media. Binary response consumers must account for strict's ArrayBuffer default instead of core's text fallback. Changing entry points is not an unconditional behavior-preserving migration.
