---
"openapi-chain": patch
---

Preserve significant path slashes. Trailing-slash paths (except `/`) and repeated leading slashes now require `$path()` in the typed API and no longer collide with chain routes. Strict template requests preserve repeated leading slashes.

Infer multipart content defaults from explicit types and supported allOf compositions instead of treating every composition as JSON. Ignore Paths specification extensions, reject malformed non-path keys, and decode local reference URI fragments before JSON Pointer escapes with explicit malformed-reference errors.

Add an independent generated-schema conformance corpus, real HTTP wire assertions and installed-tarball consumer coverage. These checks do not certify all OpenAPI features or establish remote publication.
