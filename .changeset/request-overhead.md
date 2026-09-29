---
'openapi-chain': patch
---

Reduce per-request overhead in core and strict clients. The service base URL boundary is parsed once
and reused while `baseUrl` is unchanged, and plain header records from `init.headers` or header
extensions merge without an intermediate `Headers` object. Header precedence, case-insensitive
duplicate handling and invalid-header rejections are unchanged.
