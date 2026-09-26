# Contributing

See [development](docs/development.md) for setup and command details, and [architecture](docs/architecture.md) for package boundaries.

## Local workflow

1. Use the Node.js version in `.node-version` and the pnpm version in `package.json`.
2. Run `pnpm install --frozen-lockfile` after cloning.
3. Implement a focused change and add behavior tests or type regressions as appropriate.
4. Run `pnpm format` and `pnpm check`.
5. For user-facing changes, run `pnpm changeset` and select patch, minor or major. Tooling-only changes do not require a release changeset.
6. Stage the intended files, then run `pnpm commit`.

Use Conventional Commits, for example `feat(client): support query parameters` or `fix(client): preserve request headers`. PR titles follow the same convention for squash merges. Commitizen describes the Git commit; Changesets independently describes the user-facing release. One does not replace the other.

Apply the [compatibility policy](docs/compatibility.md) when selecting a changeset. TypeScript assignment changes, serialization defaults and compiled metadata formats are public contracts; a correctness fix can still require a breaking release. Keep historical compiled-artifact fixtures unchanged and add compatibility evidence when altering the compiler/runtime boundary.

## Tests and packaging

Vitest uses explicit imports instead of globals. Put tests under `test/` and keep test code out of the published package. Use Vitest's `expectTypeOf` or TypeScript `@ts-expect-error` assertions for type regressions; `pnpm typecheck` checks the tests. Coverage includes `packages/core/src/**/*.ts` and `packages/query/src/**/*.ts`, including unimported modules.

`pnpm check` covers formatting, typed lint, generated-fixture freshness, type checking, tests with coverage, build validation, installed-tarball consumers, core gzip size and type-scale budgets. Do not replace these checks with tests that only import source files: exports and declaration paths can fail only after packing. Package checks exercise all three entry points in ESM and CommonJS, including typed operations and mocked requests.

Keep the default runtime dependency-free and at or below 3584 bytes transitive gzip. Runtime OpenAPI serialization metadata belongs in `/strict`; prefer operation-derived extensions or a custom transport for vendor behavior. See [architecture](docs/architecture.md).

## Releases

Follow the one-time setup in [the development guide](docs/development.md#release-setup). Changesets collects release notes in `.changeset/*.md`. `pnpm version:packages` consumes those files, updates each package's manifest and changelog, and refreshes `pnpm-lock.yaml`. Normally the release PR handles this operation.

For local releases, `pnpm release` checks the project and invokes Changesets publication; it is a real publishing command and requires registry authentication. The CI workflow instead packs verified artifacts and publishes them in a separate job using Trusted Publishing. Builds and local checks alone do not prove npm publication or remote CI success.

## Compatibility and integration checks

`pnpm test:generated` compares freshly generated Petstore, Items and conformance fixtures with their checked-in declarations. Update schemas via `pnpm generate:example` and format them before committing; do not hand-edit generated declarations.

`pnpm check` includes type-scale instantiation/memory budgets. Deterministic URL corpus and local HTTP tests run with the normal Vitest suite. For transport-facing changes also run `pnpm build`, `pnpm exec playwright install chromium`, then `pnpm test:browser`. CI runs Chromium separately from the Node/OS matrix.

Use `pnpm benchmark` for repeatable performance evidence. Report the environment, scenario and measurement method; see [performance.md](docs/performance.md). Neither coverage percentages nor microbenchmarks replace real generator and wire tests.

## Documentation changes

Keep README focused on the package's purpose, installation, first request and navigation. Put detailed contracts in [API reference](docs/api.md), support limits in [support](docs/support.md), and contributor commands in [development](docs/development.md). Update the [documentation index](docs/README.md) when adding a guide.

Use concrete schemas for code examples and verify their types with the pinned generator. Preserve status/media correlation and distinguish HTTP results from rejected promises. Check relative links and heading anchors after moving sections. Keep user guides free of commit hashes; use release versions for compatibility changes. Place historical verification reports in `docs/archive/qualification/`, with one baseline commit link at the top and sections describing changes, verification and limitations. Preserve recorded dates, environments and results; do not present historical measurements as current results. Link reports through the archive index rather than adding commit tables to the main navigation. Add release notes when documentation describes a user-visible behavior change; navigation or wording-only changes need no changeset.

### Tagged releases and recovery

Pushing a `v<packages/core/package.json version>` tag publishes that exact commit after CI passes, once the scoped publication gate is enabled. Tags must point to commits on `main`; tag/version mismatches fail before publishing. The release workflow serializes publication to avoid overlapping branch and tag runs.

For a tag created before tag publishing was configured, run the **Release** workflow on `main` and set `release_tag` to the existing tag (for example, `v0.3.0`). This uses the current workflow while verifying, packing and publishing the immutable tagged source. Do not move an existing public tag. Leave the input empty for the usual Changesets version-PR flow; pending changesets select versioning rather than publication.
