---
"openapi-chain": patch
---

Preserve File names when strict multipart serialization changes part media types. Resolve single unparameterized media ranges using each Blob/File's matching concrete type and reject unresolved ranges before transport.

Retain explicit media parameters on generated multipart text parts. Support UTF-8 generation and reject unsupported charsets instead of silently sending different bytes. Pre-encoded binary parts and whole-body extensions remain available for other encodings.

Accept ArrayBuffer views in core binary request bodies while preserving byte offsets and lengths. Verify filenames, media types, character bytes and binary slices through installed-package HTTP consumers and Chromium.
