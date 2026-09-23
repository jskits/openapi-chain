---
"openapi-chain": patch
---

Scope ambiguous-schema serialization requirements to the actual multipart or URL-encoded media selected by a request. Explicit JSON, +json, text and binary bodies selected from wildcard declarations no longer incorrectly require a body extension. Preserve fail-closed form/querystring behavior and the precedence of general custom-serialization requirements.
