# Large schemas and build-time metadata

[Documentation index](README.md) · [Official CLI](cli.md) · [Performance](performance.md) · [Compiler options](api.md#metadata-compiler-options)

Use one explicit scope for both client types and runtime metadata. This controls cost by the selected schema subset, not automatically by source-code call sites. If every route is selected, the full cost remains. Dynamic metadata lookups do not give a bundler enough information to eliminate uncalled operations reliably.

## Official generation workflow

The [CLI guide](cli.md) covers installed applications. The checked-in [catalog example](../examples/scoped/client.ts) uses the same CLI and public package imports:

```sh
pnpm generate:scoped
pnpm test:scoped
```

Its only scope definition is [openapi-chain.config.json](../examples/scoped/openapi-chain.config.json):

```json
{
  "schema": "./openapi.json",
  "outDir": "./generated",
  "paths": ["/items", "/items/{id}"]
}
```

The collection endpoint is a separate key. Selecting `/items/{id}` does not include `/items`. Exact keys avoid synchronizing a runtime regular expression and an independently written type pattern. For larger prefix-based scopes, generate an exact key list and verify it rather than maintaining two selectors.

The CLI generates `schema.d.ts`, `scope.ts`, `metadata.ts`, and `manifest.json` together. The scoped type is equivalent to:

```ts
import type { paths } from './schema.js';
export const selectedPaths = ['/items', '/items/{id}'] as const satisfies readonly (keyof paths)[];
export type ScopedPaths = Pick<paths, (typeof selectedPaths)[number]>;
```

The full source document remains available for local references, including references into unselected path items. The type generator emits full declarations; the selected `Pick` narrows client types, and only selected operations enter runtime metadata. This is not declaration pruning or source-call-site tree shaking.

Create the client with `createStrictClient<ScopedPaths>({ baseUrl, metadata })`. The generic is essential: merely declaring ScopedPaths does not narrow an untyped client. Both chain nodes and `$path()` completion narrow to the selected keys.

## Checks and deployment

`pnpm test:scoped` invokes the CLI's read-only `--check`, bundles the browser entry, verifies that its module graph excludes the source document, compiler and CLI, executes selected requests, and checks that an unselected route fails before transport. It runs in `pnpm check`. Generated files are excluded from formatter/linter writes to preserve byte-for-byte reproducibility.

The manifest binds the normalized source hash, config, selected paths, tool versions and artifact hashes. `--check` regenerates all outputs in memory, so hand-editing an artifact or its manifest cannot make stale output pass. The release version command regenerates this fixture after changing package versions.

The generated metadata module uses a `CompiledOpenAPIMetadata` assertion because JSON output cannot carry a TypeScript brand. The assertion itself does not validate data. Use it only for compiler-produced artifacts under your build's control; arbitrary remote JSON or a cast is not equivalent to successful compilation. Keep runtime metadata immutable.

Browser and edge clients import only the generated metadata module and `@openapi-chain/core/strict`. They should not import the source document, CLI or `@openapi-chain/core/metadata` at runtime. The generated metadata module's import from that entry is type-only and is erased.

A scoped result remains `complete: true` for its selected operations. Calls outside it fail before transport. This is a safety net, not a replacement for synchronized generation. The programmatic compiler skips unrelated operations, but the CLI also generates full type declarations and may reject invalid unselected portions of the document. Its upstream type generator currently limits CLI input to OpenAPI 3.0/3.1; the programmatic metadata compiler continues to support 3.2.
