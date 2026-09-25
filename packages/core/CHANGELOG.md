# Changelog

## 0.5.2

### Patch Changes

- ca12304: Accept `style: deepObject` parameters and Encoding Objects without an explicit `explode: true`. OpenAPI 3.2 states that `explode` has no effect on `deepObject` and defaults to `false`, so the default spelling previously failed compilation, and explicit `explode: false` failed form and multipart serialization. All spellings now compile to the same metadata and send the same `name[key]=value` pairs.
- ad06b6f: Reject empty path parameter values before transport in core and strict clients, including values from path extensions and strict styles that render nothing (such as an empty array). A value like `''` for `/items/{id}` previously requested `/items/`, which servers commonly route to the collection endpoint. Literal empty segments written in a `$path()` template are unaffected. Path safety errors now read "Unsafe path delimiter or empty path segment."
- 8893601: Accept Encoding Object keys that name properties declared in `oneOf` or `anyOf` alternatives of a request-body schema. Such documents previously failed compilation with "Encoding key … is not a request-body schema property", even though the property exists; keys that no alternative declares are still rejected.
- 8ec4c1b: Accept forwarded `OperationInputFor` values for every request-body shape again. Since 0.5.1, passing such a value to its operation failed to type-check when the operation had an optional request body, and forwarded inputs without a body or relying on strict single-media inference were also affected. Literal calls still take exactly the selected media declaration's body.
- ec50684: Ignore `allowReserved` on parameters where OpenAPI says it does not apply, such as path and header parameters in OpenAPI 3.0/3.1, instead of failing compilation of the whole document. Query parameters, and OpenAPI 3.2 path parameters and `form` cookies, still use reserved expansion.
- f30d212: Report conflicting property types in request-body schemas with the operation, media type, property and conflicting types, and keep other operation compile errors located the same way through `method`, `pathTemplate` and a message prefix. Under `*/*` and `application/*`, such conflicts no longer fail the whole document: JSON and other non-form selections still compile, and form serialization requires a whole-body extension, as with other inference failures.
- 05217be: Select the typed request body with the same rules the runtime uses to pick a media declaration: case-insensitive media types, parameters compared as a set, the most specific range first and then the most matching parameters. A `contentType` such as `application/json; charset=utf-8` can no longer take the body type of a broader `application/*` declaration when the runtime applies `application/json`. Such spellings are now rejected unless they match the selected declaration's typed spelling.

## 0.5.1

### Upgrade notes

- Metadata compiled by 0.5.0 keeps its old property media and serializer requirements. Recompile metadata, or regenerate `@openapi-chain/cli` output, to apply the metadata fixes below.
- Typed calls that pass the body of a broader media declaration with a more specific declared `contentType` now fail type checking. Use the body type of the declaration that matches the `contentType`.
- Schemas whose explicit `type` values disagree between a node and its `allOf` branches (object, array or scalar) are now rejected during metadata compilation. Before this release, such conflicts were only rejected when every type appeared inside `allOf`.

### Patch Changes

#### Request body types

- ff5fc98: Type request bodies from the most specific matching media declaration, matching runtime selection, so a wildcard declaration can no longer supply the body type for a more specific declared media type.

#### Strict metadata and serialization

- f779671: Keep the strict multipart `contentEncoding` check on array `items` when a sibling `allOf` does not declare an encoding, so such requests fail before transport instead of being sent without per-part encoding.
- 5110894: Infer multipart and form part media from array `items` declared in `allOf` branches instead of falling back to `application/octet-stream`.
- 4d16621: Default OpenAPI 3.2 array values nested inside an array property to `application/json`, following Encoding By Name, instead of the innermost scalar media type.
- b6d47a6: Ignore `Content-Type` in multipart Encoding Object `headers`, as OpenAPI requires, instead of demanding a whole-body extension. Other part headers still require one.
- d5aace6: Accept OpenAPI 3.2 cookie parameters with `explode: false`. Primitive values serialize normally; compound values remain rejected before transport.
- fc881fc: Derive multipart and form metadata from one conjunctive schema analysis, so property kinds, default part media and `contentEncoding` restrictions agree for every equivalent schema spelling. Binary markers split across `allOf` now compile like their inline form, explicit `type` values take precedence over `items`/`properties` hints, and explicit types that disagree across `allOf` are rejected consistently.

## 0.5.0

### Packaging and compatibility

- Move the runtime into `packages/core` in the pnpm monorepo and build its ESM, CommonJS, declarations and source maps through Turbo. The published runtime remains dependency-free.
- Keep the public package name `openapi-chain` and the `openapi-chain/strict` and `openapi-chain/metadata` entry points. The core package ships the implementation directly; no legacy compatibility package or `@openapi-chain/core` dependency is required.
- Keep NodeNext consumers covered with TypeScript 6 and 7 and retain the current 3072-byte transitive core gzip budget. Earlier entries below record the budget before the additional runtime safeguards.

### Minor Changes

- ad814a3: Add an explicit onAmbiguousTemplate: 'allow' metadata compiler option for nonconforming third-party documents. Keep default rejection, exact template serialization, and fail-closed ambiguous chain routing.
- 5dc1635: Introduce the OpenAPI-typed fluent client with a dependency-free core capped at 2048 bytes transitive gzip, typed per-operation extensions, configurable HTTP error handling, and custom transports.
  
  Add opt-in `/strict` serialization and `/metadata` compilation for OpenAPI 3.0, 3.1 and 3.2, including parameter styles, form and multipart encoding, QUERY, querystring and cookie support with explicit errors for unsupported wire representations.
  
  Preserve operation-specific path and request-body typing, response status correlation, and whole-request body extensions. Publish all three entry points with ESM/CommonJS runtime and declaration validation, runtime conformance tests, and type regressions.
- f46cc9f: Add exact-path selection to metadata compilation. Resolve references against the full source document, reject unknown selections, and retain fail-closed completeness for the selected subset.
- 753256c: Expose TypeError-compatible OpenAPIChainError with stable codes for unsafe paths, metadata compilation and mismatch, serialization, and response extension contracts. Request errors include method and path template context, and JSON failures retain their original cause.
- 9680d64: Require a complete version 1 compiled-metadata envelope at strict client construction, including valid route and operation records. JavaScript callers and forged type assertions can no longer silently fall back to schema-free routing when metadata is omitted or partial. JSON-decoded compiler artifacts and complete empty scopes remain supported.
- 071df08: Allow HTTP method names such as `query` as strict fluent path segments when the current metadata node has no matching operation. Real operations keep priority; `$path()` selects conflicting paths. Preserve `then` and `$path` reservations and keep core unchanged. Type-level routing now retains runtime route occupancy even when dynamic argument types narrow candidate operations.
- e53d815: Resolve strict fluent routes with one trailing slash from compiled metadata, preserving exact URLs and per-method selection. Same-method route collisions now require the typed `$path()` escape in both strict types and runtime. Core routing remains unchanged.

### Patch Changes

- 84bd350: Invoke strict query and querystring extensions for explicitly supplied empty records, matching core query behavior. Required and undeclared input validation still runs first. Earlier strict callers that relied on skipping empty-record callbacks should omit the input or remove the callback.
- c2b4958: Reject literal wildcard request content types at typed operation calls, including named literal inputs, while allowing concrete media selected from wildcard OpenAPI declarations.
- dbdb40e: Default OpenAPI 3.2 cookie-style parameters to explode=true.
- 0d2e828: Reject wildcard request Content-Type values in core before calling a body extension, matching strict runtime and typed operation constraints.
- 9f7a094: Ignore Encoding contentType when explicit style, explode, or allowReserved selects RFC6570 serialization, including otherwise ambiguous multi-media contentType values.
- f1f27fd: Freeze the exported HTTP method tuple at runtime so JavaScript consumers cannot change global Proxy dispatch, route indexing or metadata compilation. Preserve the public readonly tuple API.
- a39ea6f: Fix compatibility with current openapi-typescript parameter records, reserved Unicode expansion, inherited FormData Content-Type headers, prototype-named metadata keys and dot-segment URL normalization. Bound recursive schema inference and reference traversal with controlled errors.
  
  Index strict operation routes at client construction instead of scanning the entire document per request. Treat the routing metadata as immutable for the client's lifetime.
  
  Clarify validation, response parsing, HTTP errors and extension ordering. Add real-generator, local HTTP, Chromium, adversarial URL and schema-scale qualification, plus a complete generated-schema onboarding example. The existing 2 KB core and 90% coverage gates remain enabled.
- 02cdfc1: Merge operation-level header parameter types case-insensitively, matching runtime override behavior while preserving case-sensitive query parameters.
- 92ec60f: Restrict field inference to form-capable media so recursive JSON schemas remain usable. Wildcards preserve JSON serialization while rejecting unsupported form inference.
- 3764aab: Reject JSON serialization that produces no value across core, strict, parameters, and form parts. Report the serialization location and media type while retaining the original error cause.
- 9d2553c: Classify response media types independently of parameters. Parse JSON only for application/json and structured +json types, and avoid decoding binary responses because a parameter happens to contain xml.
  
  Enforce UTF-8 declarations for automatically generated request text across core and strict serialization. Preserve pre-encoded binary bodies and custom extension ownership. Share charset validation with multipart and parameter-content serialization.
  
  Add installed-package HTTP and Chromium checks for response media classification and text encoding. Preserve the 2048-byte core gzip budget by consolidating request construction.
- 612c964: Preserve media parameters when matching request content types and selecting serialization rules. Prefer the most specific matching declaration and reject ambiguous matches, malformed parameters, and mismatched profiles.
- 7ea3bf7: Reject malformed required flags, missing request body content, non-object media entries, and invalid Encoding header maps instead of silently weakening serialization metadata.
- 8e67721: Capture a deeply frozen metadata snapshot when creating a strict client. Caller mutations and operation extensions cannot alter the client's routing and serialization contract after initialization, including when using JSON-generated CLI artifacts.
- ebd1cd5: Validate OpenAPI version syntax and reject QUERY operations in versions before 3.2.
- 53a47ad: Preserve File names when strict multipart serialization changes part media types. Resolve single unparameterized media ranges using each Blob/File's matching concrete type and reject unresolved ranges before transport.
  
  Retain explicit media parameters on generated multipart text parts. Support UTF-8 generation and reject unsupported charsets instead of silently sending different bytes. Pre-encoded binary parts and whole-body extensions remain available for other encodings.
  
  Accept ArrayBuffer views in core binary request bodies while preserving byte offsets and lengths. Verify filenames, media types, character bytes and binary slices through installed-package HTTP consumers and Chromium.
- f78e5e6: Recognize native Fetch body values across realms using platform brand checks, preserving iframe FormData, Blob, URLSearchParams, ArrayBuffer and file names while rejecting toStringTag imitations.
- bc67da9: Propagate unsupported nested Encoding to URL-encoded as well as multipart serializers. Evaluate applicability using the part media type, and restrict multipart-only requirements to actual multipart requests so ignored JSON annotations cannot block valid requests.
- 839d30a: Select request-body serialization from the most specific declared media type, including declarations that require no extra metadata. Broader media ranges no longer supply encoding rules to an exact declaration.
  
  Memoize schema analysis within each compilation and bound traversal work independently of recursion depth. Cached results retain depth information, and compilation caches do not persist across document changes.
  
  Exclude mixed path templates such as `{year}-{month}` and `{a}{b}` from callable dynamic chains; use `$path()` with the declared parameter types instead.
  
  Preserve conjunctive allOf property definitions. Resolve references according to their object context and OpenAPI version: Reference Object siblings cannot override serialization fields, OAS 3.1/3.2 Schema Object siblings are conjunctive, and overlapping Path Item reference fields fail explicitly.
  
  Add wire-invariance tests and a shared-schema DAG benchmark. Existing core-size and coverage gates remain enabled.
- ead04d8: Require explicit concrete content types for parameterized media ranges and accept concrete selections with their declared parameter suffix. Keep wildcards in parameter values separate from wildcards in the media type itself.
- 70f1f18: Require plain records for structured form and parameter serialization. Date, Map, Blob and class instances now fail instead of becoming empty forms or disappearing query values; ordinary cross-realm and null-prototype records remain supported.
- 33965b6: Validate conflicting query/querystring inputs, input location shapes, undeclared bodies and explicit content types before strict header factories and serialization callbacks. Keep media selection depending on dynamically produced headers in the serialization phase.
- d4f3fc0: Keep strict metadata snapshots free of inherited dictionary entries so additional form fields named `constructor`, `toString`, or `__proto__` serialize correctly, including with JSON-decoded metadata.
- 38e06f6: Reject native FormData when the selected content type is not unparameterized `multipart/form-data`, including results from body extensions. Prevent silent conversion to multipart, JSON data loss, and discarded multipart parameters. Whole-body extensions can still return encoded bytes or text to control the exact representation.
- 86d9492: Parse Encoding contentType lists without splitting quoted parameter commas, and reject malformed declarations during metadata compilation. Fail before transport when native Blob would lowercase a case-sensitive multipart parameter or discard a non-ASCII parameter; whole-body extensions remain available for those representations.
- 916acc9: Preserve literal dollar replacement tokens in core chain paths, explicit paths and path extensions, including base URLs with query strings or fragments.
  
  Allow acyclic nested schema references to the same target without confusing them with recursive serialization inference. Retain cycle detection, shared-subgraph caching, depth limits and compilation work limits.
  
  Extend wire-invariance coverage and qualify shared-prefix projects with response unions and incremental TypeScript checks. Document schema inference boundaries separately from runtime data validation.
- 2bce025: Stop choosing the first non-null entry of a schema type array. Ambiguous form serialization requires a whole-body extension, including ambiguity reached through references, allOf, and array items. Nullable single-type inference and explicit JSON serialization remain supported.
- 66800e7: Reject strict-only middleware, metadata and function headers in core at runtime, including JavaScript callers. Preserve core response parsing and document migration boundaries. Consolidate equivalent core operations while retaining the 2048-byte transitive gzip gate.
- 1ee9513: Reject status-zero responses in core and strict clients with TypeError in both error modes, before parsing or calling response extensions. Opaque, opaque-redirect, and error responses can no longer escape the declared HTTP result union.
- 3bd8b48: Preserve significant path slashes. Trailing-slash paths (except `/`) and repeated leading slashes now require `$path()` in the typed API and no longer collide with chain routes. Strict template requests preserve repeated leading slashes.
  
  Infer multipart content defaults from explicit types and supported allOf compositions instead of treating every composition as JSON. Ignore Paths specification extensions, reject malformed non-path keys, and decode local reference URI fragments before JSON Pointer escapes with explicit malformed-reference errors.
  
  Add an independent generated-schema conformance corpus, real HTTP wire assertions and installed-tarball consumer coverage. These checks do not certify all OpenAPI features or establish remote publication.
- 31b36ca: Resolve OpenAPI 3.2 Media Type Object references before compiling request-body and parameter-content metadata. Preserve referenced Encoding rules instead of silently using default serialization, and reject external, missing or cyclic media references.
- d7a9822: Validate response extension status and presence of data consistently across core and strict, including JavaScript callers and empty responses.
- d3e1d9f: Scope ambiguous-schema serialization requirements to the actual multipart or URL-encoded media selected by a request. Explicit JSON, +json, text and binary bodies selected from wildcard declarations no longer incorrectly require a body extension. Preserve fail-closed form/querystring behavior and the precedence of general custom-serialization requirements.
- 5a35322: Share URL joining and query suffix handling across core and strict. Avoid duplicate query separators and normalize trailing base URL slashes consistently without altering route path fidelity.
- d9ed95c: Reject raw path delimiters, control characters and dot-segment normalization before header/query/body callbacks. Path extensions must return one encoded segment. Verify constructed URLs preserve the service origin and base path in both core and strict clients. Whole-request extensions and custom transports remain trusted application code.
  
  Increase the core transitive gzip budget from 2048 to 3072 bytes to retain these runtime safeguards; the measurement and dependency-free boundary remain unchanged.

The predecessor implementation used the name `openapi-client-codegen`; its version numbers are not releases of `openapi-chain`.

See [the legacy implementation changelog](https://github.com/jskits/openapi-chain/blob/main/docs/legacy-changelog.md) for the preserved migration history.
