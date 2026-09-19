# Contributing

## Local workflow

1. Use the Node.js version in `.node-version` and the pnpm version in `package.json`.
2. Run `pnpm install --frozen-lockfile` after cloning.
3. Implement a focused change and add behavior tests or type regressions as appropriate.
4. Run `pnpm format` and `pnpm check`.
5. For user-facing changes, run `pnpm changeset` and select patch, minor or major.
   Tooling-only changes do not require a release changeset.
6. Stage the intended files, then run `pnpm commit`.

Use Conventional Commits, for example `feat(client): support query parameters` or
`fix(client): preserve request headers`. PR titles follow the same convention for
squash merges. Commitizen describes the Git commit; Changesets independently
describes the user-facing release. One does not replace the other.

## Tests and packaging

Vitest uses explicit imports instead of globals. Put tests under `test/` and keep
test code out of the published package. Use Vitest's `expectTypeOf` or TypeScript
`@ts-expect-error` assertions for type regressions; `pnpm typecheck` checks the tests.
Coverage includes all `src/**/*.ts` files, including unimported modules.

`pnpm check` covers formatting, linting, type checking, tests with coverage, build
validation and an installed-tarball smoke test. Do not replace these checks with
tests that only import source files: exports and declaration paths can fail only
after packing. Package checks exercise all three entry points in ESM and CommonJS, including typed operations and mocked requests.

Keep the default runtime dependency-free and at or below 2048 bytes transitive gzip. Runtime OpenAPI serialization metadata belongs in `/strict`; prefer operation-derived extensions or a custom transport for vendor behavior. See [architecture](docs/architecture.md).

## Releases

Follow the one-time setup in [README.md](./README.md#release-setup). Changesets
collects release notes in `.changeset/*.md`. `pnpm version:packages` consumes those
files, updates `package.json` and `CHANGELOG.md`, and refreshes `pnpm-lock.yaml`.
Normally the release PR handles this operation.

For local releases, `pnpm release` checks the project and invokes Changesets
publication; it is a real publishing command and requires registry authentication.
The CI workflow instead packs verified artifacts and publishes them in a separate
job using Trusted Publishing. Builds and local checks alone do not prove npm
publication or remote CI success.

## Compatibility and integration checks

`pnpm test:generated` compares freshly generated Petstore and onboarding fixtures
with their checked-in declarations. Update schemas via `pnpm generate:example`
and format them before committing; do not hand-edit generated declarations.

`pnpm check` includes type-scale instantiation/memory budgets. Deterministic URL
corpus and local HTTP tests run with the normal Vitest suite. For transport-facing
changes also run `pnpm build`, `pnpm exec playwright install chromium`, then
`pnpm test:browser`. CI runs Chromium separately from the Node/OS matrix.

Use `pnpm benchmark` for repeatable performance evidence. Report the environment,
scenario and measurement method; see [performance.md](docs/performance.md). Neither
coverage percentages nor microbenchmarks replace real generator and wire tests.
