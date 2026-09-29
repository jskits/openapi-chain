---
'openapi-chain': minor
---

Add `createRequestSerializer` to `openapi-chain/strict` and a new `openapi-chain/openapi-fetch`
entry with `withOpenAPISerialization`. The serializer encodes one operation's path, query, header
and cookie parameters and request body from compiled metadata without sending a request. The adapter
applies the same OpenAPI serialization to an existing openapi-fetch client while openapi-fetch keeps
its types, middleware and response handling.
