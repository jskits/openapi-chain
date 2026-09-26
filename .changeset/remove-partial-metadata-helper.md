---
"openapi-chain": minor
---

Remove `defineOpenAPIMetadata`, an identity helper that did not validate metadata or produce the compiled artifact required by strict clients. Use `compileOpenAPIMetadata` or the CLI for strict metadata. Code that only describes a partial table can use `satisfies OpenAPIMetadata` without implying it is safe to execute.
