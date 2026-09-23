---
"openapi-chain": minor
---

Allow HTTP method names such as `query` as strict fluent path segments when the current metadata node has no matching operation. Real operations keep priority; `$path()` selects conflicting paths. Preserve `then` and `$path` reservations and keep core unchanged. Type-level routing now retains runtime route occupancy even when dynamic argument types narrow candidate operations.
