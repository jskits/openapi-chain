---
"openapi-chain": patch
---

Reject raw path delimiters, control characters and dot-segment normalization before header/query/body callbacks. Path extensions must return one encoded segment. Verify constructed URLs preserve the service origin and base path in both core and strict clients. Whole-request extensions and custom transports remain trusted application code.

Increase the core transitive gzip budget from 2048 to 3072 bytes to retain these runtime safeguards; the measurement and dependency-free boundary remain unchanged.
