---
'openapi-chain': patch
---

Keep the strict multipart `contentEncoding` check on array `items` when a sibling `allOf` does not declare an encoding, so such requests fail before transport instead of being sent without per-part encoding.
