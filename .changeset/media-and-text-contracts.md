---
"openapi-chain": patch
---

Classify response media types independently of parameters. Parse JSON only for application/json and structured +json types, and avoid decoding binary responses because a parameter happens to contain xml.

Enforce UTF-8 declarations for automatically generated request text across core and strict serialization. Preserve pre-encoded binary bodies and custom extension ownership. Share charset validation with multipart and parameter-content serialization.

Add installed-package HTTP and Chromium checks for response media classification and text encoding. Preserve the 2048-byte core gzip budget by consolidating request construction.
