---
"openapi-chain": patch
---

Resolve OpenAPI 3.2 Media Type Object references before compiling request-body and parameter-content metadata. Preserve referenced Encoding rules instead of silently using default serialization, and reject external, missing or cyclic media references.
