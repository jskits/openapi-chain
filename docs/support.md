# Supported behavior and boundaries

| Surface                                    | Core                                                                   | Strict                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fluent path tree                           | Operation-derived types, scalar path encoding                          | Same type model with metadata-driven path encoding                                                          |
| Mixed templates and reserved segment names | Typed `$path()`                                                        | Typed `$path()`                                                                                             |
| Query objects/arrays                       | Schema-free defaults or local extension                                | OpenAPI form, delimited and deepObject styles                                                               |
| Whole-query `querystring`                  | Not supported by the core typed input                                  | OpenAPI 3.2 metadata and extension support                                                                  |
| Headers/cookies                            | Basic serialization or extension                                       | Metadata-driven styles/content; browser restrictions still apply                                            |
| JSON/text/native request bodies            | Explicit contentType                                                   | Single-concrete-media inference when metadata proves it                                                     |
| Structured URL-encoded/multipart body      | Whole-body extension                                                   | Encoding Objects and supported native Fetch representations                                                 |
| Vendor wire behavior                       | Location/body extensions, then final request/transport                 | Same order; metadata validation precedes serialization                                                      |
| Middleware                                 | Implement in transport                                                 | Middleware composition and transport                                                                        |
| Response parsing                           | JSON/text defaults                                                     | JSON/text/binary defaults                                                                                   |
| Streaming                                  | Explicit response extension and matching declared data type            | Same                                                                                                        |
| Runtime JSON Schema validation             | Application responsibility                                             | Application responsibility                                                                                  |
| Runtime response status/data validation    | Extension status must match actual response; schema data not validated | Same                                                                                                        |
| Metadata compilation                       | Not loaded                                                             | Separate compiler for 3.0/3.1/3.2 serialization metadata                                                    |
| External references                        | No document processing                                                 | Rejected: bundle/dereference first                                                                          |
| Recursive schemas                          | No document processing                                                 | Ordinary object recursion is allowed; non-inferable serialization cycles and depth over 128 fail explicitly |

## Platform and type boundaries

The public type model supports fixed OpenAPI methods, including QUERY. Actual Fetch
implementations can reject methods such as TRACE and GET/HEAD bodies. A custom
transport must itself support any operation native Fetch cannot send. Browser
Cookie headers, CORS and credentials follow browser policy; use credentials and
server-set cookies for browser sessions.

Paths containing whole literal or encoded dot segments are rejected. Native Fetch
would normalize them and change the endpoint. Other structural limitations of the
chain, including `then`, HTTP method names, mixed templates, trailing slashes
(except the root `/`) and repeated leading slashes, use `$path()`. These slash
structures remain exact and are excluded from chain routing and chain types.

Generated binary types and actual parser values must agree. Use an operation
response extension for binary/stream/vendor formats and configure your generator's
type mapping accordingly. A generic `paths` parameter is not runtime validation.

Metadata analysis caches shared schema subgraphs within each compilation. A
1,000,000-step work budget bounds traversal in addition to the 128-level depth
limit; exceeding either fails explicitly. Compile large documents at build time.
Caches are discarded between compilations.

Compiled metadata and `paths` must come from the same schema revision. Treat
metadata as immutable while a client is alive. Strict routing is indexed at client
construction; replace the client when the routing document changes.

Advanced multipart per-part headers, ordered/nested encoding and content-transfer
encodings that native FormData cannot represent are rejected or require a whole
body extension. Arbitrary OpenAPI 3.2 additionalOperations are not supported.

## Qualification scope

Local checks cover strict TypeScript, pinned real generator output, behavior and
negative type tests, deterministic adversarial URL data, local HTTP, installed
ESM/CJS tarballs, declaration resolution, coverage, core size and type-scale budgets.
Chromium is a separate CI job. Node 22/24/26 and Windows/macOS/Linux are configured
in the CI matrix; local success does not establish that those remote jobs passed.

This is a serialization support matrix, not a certification of every OpenAPI
feature. Links, callbacks, webhooks, security-scheme execution, automatic auth,
retry policy and complete schema validation are outside the client's built-in scope.
