---
'openapi-chain': patch
---

Accept Encoding Object keys that name properties declared in `oneOf` or `anyOf` alternatives of a request-body schema. Such documents previously failed compilation with "Encoding key … is not a request-body schema property", even though the property exists; keys that no alternative declares are still rejected.
