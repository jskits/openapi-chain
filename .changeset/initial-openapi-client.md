---
"openapi-chain": minor
---

Introduce the OpenAPI-typed fluent client with a dependency-free core capped at 2048 bytes transitive gzip, typed per-operation extensions, configurable HTTP error handling, and custom transports.

Add opt-in `/strict` serialization and `/metadata` compilation for OpenAPI 3.0, 3.1 and 3.2, including parameter styles, form and multipart encoding, QUERY, querystring and cookie support with explicit errors for unsupported wire representations.

Preserve operation-specific path and request-body typing, response status correlation, and whole-request body extensions. Publish all three entry points with ESM/CommonJS runtime and declaration validation, runtime conformance tests, and type regressions.
