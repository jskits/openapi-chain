---
'openapi-chain': patch
---

Invoke strict query and querystring extensions for explicitly supplied empty records, matching core query behavior. Required and undeclared input validation still runs first. Earlier strict callers that relied on skipping empty-record callbacks should omit the input or remove the callback.
