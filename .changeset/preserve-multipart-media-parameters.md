---
"openapi-chain": patch
---

Parse Encoding contentType lists without splitting quoted parameter commas, and reject malformed declarations during metadata compilation. Fail before transport when native Blob would lowercase a case-sensitive multipart parameter or discard a non-ASCII parameter; whole-body extensions remain available for those representations.
