---
"openapi-chain": patch
---

Reject native FormData when the selected content type is not unparameterized `multipart/form-data`, including results from body extensions. Prevent silent conversion to multipart, JSON data loss, and discarded multipart parameters. Whole-body extensions can still return encoded bytes or text to control the exact representation.
