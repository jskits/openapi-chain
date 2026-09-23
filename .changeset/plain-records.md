---
"openapi-chain": patch
---

Require plain records for structured form and parameter serialization. Date, Map, Blob and class instances now fail instead of becoming empty forms or disappearing query values; ordinary cross-realm and null-prototype records remain supported.
