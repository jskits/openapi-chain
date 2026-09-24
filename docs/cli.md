# Official build-time CLI

[Documentation index](README.md) · [Large schemas](large-schemas.md) · [Compiler API](api.md#metadata-compiler-options)

`@openapi-chain/cli` provides the `openapi-chain` command. It generates types, an exact path scope and runtime metadata from one configuration and one source snapshot. It is a separate Node-only package; installing `openapi-chain` alone does not install the CLI or its type-generation dependencies.

## Install and generate

```sh
pnpm add openapi-chain
pnpm add -D @openapi-chain/cli
```

The CLI uses the same Node versions as the runtime package: `^22.22.1 || ^24.11.0 || >=26.0.0`. npm users can install with `npm install --save-dev @openapi-chain/cli` and invoke `npx openapi-chain` after installation.

Create `openapi-chain.config.json`:

```json
{
  "schema": "./openapi.yaml",
  "outDir": "./src/generated/catalog",
  "paths": ["/items", "/items/{id}"]
}
```

Run:

```sh
pnpm exec openapi-chain generate
pnpm exec openapi-chain generate --check
```

For multiple APIs or scopes, create a config per output directory and invoke `generate --config <file>` for each. `--config` is relative to the current working directory; `schema` and `outDir` are relative to that config file, even when invoking the CLI from elsewhere. `--help` and `--version` are also available. Unknown flags, commands and configuration fields are errors.

For an unpublished source checkout, run `pnpm install` and `pnpm build` in the repository, then invoke `node packages/cli/src/cli.mjs generate --config <file>`. Registry installation requires the separate CLI package to have been published; local generation and tarball verification do not publish it.

## Configuration

| Field | Contract |
| --- | --- |
| `schema` | Required local `.json`, `.yaml` or `.yml` input |
| `outDir` | Required dedicated directory for generated output |
| `paths` | Optional exact path keys; omitted selects all paths, `[]` selects none |
| `onAmbiguousTemplate` | Optional `"throw"` (default) or explicit `"allow"`; same policy as the compiler API |

Every selected path includes all its declared methods. Selection is deduplicated and emitted in source-document order. Unknown keys fail; there are no globs, prefix matching or operation-level selection. The collection `/items` and item `/items/{id}` are separate keys. `allow` does not bypass other errors or make ambiguous fluent calls safe; see [the compatibility recipe](troubleshooting.md#a-third-party-document-repeats-a-template-hierarchy).

The first CLI release supports OpenAPI 3.0 and 3.1. Its pinned upstream type generator does not fully model OpenAPI 3.2, so the CLI rejects 3.2 explicitly. The separate `compileOpenAPIMetadata()` API continues to support OpenAPI 3.2.

Inputs must be bundled local documents. The CLI rejects external `$ref` strings anywhere in the document, including unselected paths, before invoking the generator. This conservative preflight also applies to literal `$ref` keys in example data. References using local JSON Pointer fragments are resolved against the full source document. Do not remove unselected paths before generation: selected operations can reference them. Remote input fetching and external reference resolution are not CLI features.

The CLI generates full schema declarations, so upstream type validation can reject invalid unselected portions of a document. Scope only narrows the client type and runtime metadata; it does not prune the full declaration file or infer scope from application call sites. See [support boundaries](support.md) for metadata's serialization analysis; generation is not runtime data validation.

## Generated files

| File            | Purpose                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `schema.d.ts`   | Full declarations from the pinned `openapi-typescript` generator           |
| `scope.ts`      | `selectedPaths` and `ScopedPaths = Pick<paths, …>` from the same selection |
| `metadata.ts`   | Only selected runtime operations, with a type-only public metadata import  |
| `manifest.json` | Source/config hashes, selected paths, tool versions and artifact hashes    |

Use the generated type and metadata together:

```ts
import { createStrictClient } from 'openapi-chain/strict';
import { metadata } from './generated/catalog/metadata.js';
import type { ScopedPaths } from './generated/catalog/scope.js';

const api = createStrictClient<ScopedPaths>({
  baseUrl: 'https://api.example.com',
  metadata,
});
```

Do not omit `<ScopedPaths>`: runtime metadata cannot reconstruct erased TypeScript types. Calls outside the scope are absent from the generated client type and fail before transport if made from JavaScript. Browser/edge applications import the generated runtime metadata; they never need to import the CLI, source schema, manifest or compiler. The metadata module decodes embedded JSON with `JSON.parse`, preserving names such as `__proto__` as ordinary own properties. Its type assertion preserves the compiled-metadata brand but does not validate arbitrary JSON.

The CLI pins its own TypeScript 5.9.3 for generation, separately from the application's compiler. Installed consumers are checked with TypeScript 6 and 7. Consumers do not need to relax the generator's TypeScript peer dependency or copy the repository's pnpm settings.

## Reproducibility and CI

Commit all four generated files, then add a CI step after dependency installation:

```sh
pnpm exec openapi-chain generate --check
```

`--check` parses the source and regenerates all expected files in memory. It compares every file, including the manifest, without creating directories, locks or output files. Missing, stale or modified output exits with status 1. Success exits with status 0. It does not trust hashes supplied by an existing manifest.

Source hashes use UTF-8 input with CRLF normalized to LF. Configuration hashes use parsed configuration serialized deterministically for that input; changing config key order can change the hash. Generated output contains no timestamps or machine-specific paths. The manifest records CLI, runtime, type generator, generator TypeScript and YAML parser versions. Tool upgrades can require regeneration even if the selected operations did not change. Keep your package-manager lockfile committed.

Do not format or hand-edit generated files. Exclude `outDir` from formatter/linter writes; application type checking should still include it. Unchanged generation does not rewrite files or change their modification times.

For applications that do not commit generated files, run `generate` before their typecheck/build instead. A check against missing output intentionally fails.

## Output ownership and errors

The output directory is dedicated to these four files. The CLI refuses unrelated files, symbolic-link outputs, invalid ownership manifests and directories containing its config or source. An empty output directory is accepted. If an ownership manifest is missing/corrupted, inspect the directory and choose a new empty output directory, or restore the manifest from version control before regenerating.

Compilation and type generation finish before any output replacement. Writes are staged beside the target directory, protected by an exclusive lock, and installed as a complete directory. A failed replacement attempts to restore the previous output; existing backups are retained if restoration itself fails. A process interruption can leave a lock or staging/backup directory. The lock contains the writer PID; only remove a stale lock after confirming that writer has stopped. No network requests or publication commands are part of generation.

`--check` can fail transiently while another process replaces the output directory; CI should run generation and checking sequentially. The CLI does not provide watch mode, remote downloads, automatic `$ref` bundling, framework plugins, or arbitrary generator configuration in this release.

For repository contributors, [development checks](development.md) include isolated tarball installation, the real installed command, type narrowing, real HTTP calls and browser bundle isolation.
