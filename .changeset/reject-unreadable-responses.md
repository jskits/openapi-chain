---
"openapi-chain": patch
---

Reject status-zero responses in core and strict clients with TypeError in both error modes, before parsing or calling response extensions. Opaque, opaque-redirect, and error responses can no longer escape the declared HTTP result union.
