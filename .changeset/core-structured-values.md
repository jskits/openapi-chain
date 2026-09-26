---
'openapi-chain': minor
---

Reject structured core path, header and cookie values, plus nested query and array values, before transport instead of coercing them into incorrect strings. Flat arrays, flat query objects and operation-local location extensions keep their existing behavior.
