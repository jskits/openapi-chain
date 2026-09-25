---
'openapi-chain': patch
---

Derive multipart and form metadata from one conjunctive schema analysis, so property kinds, default part media and `contentEncoding` restrictions agree for every equivalent schema spelling. Binary markers split across `allOf` now compile like their inline form, explicit `type` values take precedence over `items`/`properties` hints, and explicit types that disagree across `allOf` are rejected consistently.
