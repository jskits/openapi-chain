---
"openapi-chain": patch
---

Capture a deeply frozen metadata snapshot when creating a strict client. Caller mutations and operation extensions cannot alter the client's routing and serialization contract after initialization, including when using JSON-generated CLI artifacts.
