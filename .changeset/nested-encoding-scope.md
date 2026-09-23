---
"openapi-chain": patch
---

Propagate unsupported nested Encoding to URL-encoded as well as multipart serializers. Evaluate applicability using the part media type, and restrict multipart-only requirements to actual multipart requests so ignored JSON annotations cannot block valid requests.
