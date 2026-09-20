# Legacy implementation changelog

These notes belong to the predecessor `openapi-client-codegen` implementation. They are preserved for migration history, not as published `openapi-chain` versions.

## Unreleased

- Split the exact-wire serializer into the opt-in `/strict` entry so the default schema-free client stays tiny.
- Added a hard 2048-byte transitive gzip regression gate for the default core bundle.
- Added operation-derived per-call extensions for path, query, querystring, header, cookie, body, response, and final-request customization.
- Hardened dynamic path typing, operation-level parameter overrides, `$path()` arguments, media/body correlation, and dynamic `throwOnError` overloads.
- Corrected response typing for exact status, `nXX`, `default`, and empty-content responses.
- Added optional branded compiled OpenAPI runtime metadata through the separate `/metadata` entry.
- Added OpenAPI path/query/header/cookie serialization, Parameter `content`, form-urlencoded and multipart Encoding Object handling.
- Added OpenAPI 3.2 `QUERY`, `in: querystring`, and `style: cookie` support with fail-closed handling for unsupported advanced multipart/custom methods.
- Expanded type, metadata, runtime conformance, CI, and package-consumer verification.
- Made body extensions whole-request-only, preventing strict multipart/form internals from violating operation-derived body types.
- Made response extensions return status-correlated `{ status, data }` pairs and added runtime status validation.
- Fixed tiny-core URL joining when `baseUrl` already contains a query or fragment.
- Made strict cookie serialization fail closed for compound legacy `style: form` values; use OpenAPI 3.2 `style: cookie`, Parameter `content`, or an operation cookie extension.

## 0.2.0

- Reworked path typing into a recursive shared-prefix tree.
- Added typed `$path()` for chain-unsafe OpenAPI templates.
- Added path/query/header/cookie/request-body inference and media-aware request bodies.
- Added typed success/error result utilities and configurable non-2xx behavior.
- Added Fetch transport, middleware, serializers, parsers, and structured `HttpError`.
- Added ESM/CommonJS declaration routing and package-consumer verification tooling.
