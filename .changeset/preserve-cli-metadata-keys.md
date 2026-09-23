---
"openapi-chain-cli": patch
---

Preserve all metadata property names when emitting generated modules, including __proto__, constructor and toString. Generated metadata now decodes JSON rather than interpreting schema-derived keys as JavaScript object-literal syntax, keeping required parameter validation and multipart serialization consistent with direct compilation.
