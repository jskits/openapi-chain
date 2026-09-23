---
"openapi-chain": minor
---

Require a complete version 1 compiled-metadata envelope at strict client construction, including valid route and operation records. JavaScript callers and forged type assertions can no longer silently fall back to schema-free routing when metadata is omitted or partial. JSON-decoded compiler artifacts and complete empty scopes remain supported.
