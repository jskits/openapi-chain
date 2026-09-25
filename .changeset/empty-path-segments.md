---
'openapi-chain': patch
---

Reject empty path parameter values before transport in core and strict clients, including values from path extensions and strict styles that render nothing (such as an empty array). A value like `''` for `/items/{id}` previously requested `/items/`, which servers commonly route to the collection endpoint. Literal empty segments written in a `$path()` template are unaffected. Path safety errors now read "Unsafe path delimiter or empty path segment."
