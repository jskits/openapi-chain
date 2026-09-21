# Large schemas and build-time metadata

[Documentation index](README.md) · [Performance](performance.md) · [Compiler options](api.md#metadata-compiler-options)

Use one explicit scope for both client types and runtime metadata. This controls cost by the selected schema subset, not automatically by source-code call sites. If every route is selected, the full cost remains. Dynamic metadata lookups do not give a bundler enough information to eliminate uncalled operations reliably.

## Runnable example

The checked-in [catalog example](../examples/scoped/client.ts) selects a collection and its item endpoint, leaving `/admin` out. Run:

```sh
pnpm generate:example
pnpm generate:scoped
pnpm test:generated
pnpm typecheck
pnpm test:scoped
```

`test:scoped` checks reproducibility, bundles the browser entry, verifies that its module graph excludes the source OpenAPI document and compiler, executes selected requests, and checks that an unselected route fails before transport. It runs in `pnpm check`. The build script uses the supported Node runtime's TypeScript stripping to import the scope definition; browser applications need only the emitted metadata module.

## One scope definition

```ts
import type { paths } from './schema.js';
export const selectedPaths = ['/items', '/items/{id}'] as const satisfies readonly (keyof paths)[];
export type ScopedPaths = Pick<paths, (typeof selectedPaths)[number]>;
```

The collection endpoint is a separate key. A pattern such as `/items/${string}` would omit `/items`. Exact keys avoid having to synchronize a runtime regular expression and an independently written type pattern. For larger prefix-based scopes, generate an exact key list and verify it, rather than maintaining two selectors.

At build time, compile the full source document with that selection:

```ts
const metadata = compileOpenAPIMetadata(document, { paths: selectedPaths });
```

Do not prune the input document first. References can point into components **or other path items**; the compiler retains the full document as the resolution root but only emits selected operations. Unrelated operations are not validated. Required reference failures in selected operations remain errors.

Generate declarations from that same source revision and create the runtime client with `createStrictClient<ScopedPaths>({ baseUrl, metadata })`. The generic is essential: merely declaring ScopedPaths does not narrow an untyped client. Both chain nodes and `$path()` completion narrow to the selected keys.

## Artifact provenance and deployment

[The build script](../scripts/build-scoped-example.mjs) emits a deterministic TypeScript module containing plain metadata and a source SHA-256 after normalizing CRLF to LF. It checks that emitted route keys match the selection; `--check` rejects stale output. The schema generator check independently rejects stale declarations. Together these checks bind the source, scope, declarations and metadata in the repository build.

The generated module uses a CompiledOpenAPIMetadata assertion because JSON output cannot carry a TypeScript brand. The assertion itself does not validate data. Use it only for compiler-produced artifacts under your build's control; arbitrary remote JSON or a cast is not equivalent to successful compilation. Keep runtime metadata immutable.

Compile and generate in the build environment. Browser and edge clients import only the generated module and `openapi-chain/strict`; they should not import the source document or `openapi-chain/metadata`. The example uses local source imports for repository checks; installed applications use the public package entries.

A scoped result remains `complete: true` for its selected operations. A type/metadata mismatch that reaches an omitted route fails before transport. This is a safety net, not a replacement for keeping the two outputs synchronized. Explicit `onAmbiguousTemplate: 'allow'` remains available when selected third-party paths have duplicate hierarchies; it does not bypass other compilation errors.
