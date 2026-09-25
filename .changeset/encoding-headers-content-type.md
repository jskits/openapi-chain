---
'openapi-chain': patch
---

Ignore `Content-Type` in multipart Encoding Object `headers`, as OpenAPI requires, instead of demanding a whole-body extension. Other part headers still require one.
