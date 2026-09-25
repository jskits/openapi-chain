---
'openapi-chain': patch
---

Select the typed request body with the same rules the runtime uses to pick a media declaration: case-insensitive media types, parameters compared as a set, the most specific range first and then the most matching parameters. A `contentType` such as `application/json; charset=utf-8` can no longer take the body type of a broader `application/*` declaration when the runtime applies `application/json`. Such spellings are now rejected unless they match the selected declaration's typed spelling.
