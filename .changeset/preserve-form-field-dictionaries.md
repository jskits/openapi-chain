---
"openapi-chain": patch
---

Keep strict metadata snapshots free of inherited dictionary entries so additional form fields named `constructor`, `toString`, or `__proto__` serialize correctly, including with JSON-decoded metadata.
