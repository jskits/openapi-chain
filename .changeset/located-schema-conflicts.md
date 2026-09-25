---
'openapi-chain': patch
---

Report conflicting property types in request-body schemas with the operation, media type, property and conflicting types, and keep other operation compile errors located the same way through `method`, `pathTemplate` and a message prefix. Under `*/*` and `application/*`, such conflicts no longer fail the whole document: JSON and other non-form selections still compile, and form serialization requires a whole-body extension, as with other inference failures.
