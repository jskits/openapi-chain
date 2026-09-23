# Development

[Documentation index](README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](architecture.md)

Use Node.js **24.16.0** (see `.node-version`) and **pnpm 10.34.5**. CI also checks Node.js 22.22.2 and 26, plus Windows and macOS on Node.js 24.

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm check
```

If your Node.js installation does not include Corepack, install pnpm 10.34.5 using the [pnpm installation guide](https://pnpm.io/installation).

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Rebuild the library on changes |
| `pnpm build` | Use Turbo to build the published packages in dependency order, with local output caching |
| `pnpm lint` / `pnpm lint:fix` | Oxlint checks, including type-aware rules; optional fixes |
| `pnpm format` / `pnpm format:check` | Format or check using Oxfmt |
| `pnpm typecheck` / `pnpm typecheck:ts7` | Strict source, test and example checks with pinned TS 6 / TS 7 |
| `pnpm check:ts7` | TS 7 source, installed-consumer and type-budget gates (build first) |
| `pnpm benchmark:types:ts7` / `pnpm benchmark:editor:ts7` | Native compiler complexity scenarios / actual native LSP completion samples |
| `pnpm test` / `pnpm test:watch` | Run Vitest once or in watch mode |
| `pnpm test:coverage` | Run tests with V8 coverage and 90% thresholds |
| `pnpm test:cli` | Run CLI filesystem, generation and command-contract regressions after building |
| `pnpm test:cli:package` | Install runtime/CLI tarballs and verify the installed command, generated types and browser bundle |
| `pnpm test:package` / `pnpm verify:package` | Verify all three entries in an isolated tarball consumer |
| `pnpm test:legacy:package` | Verify the old package's ESM, CommonJS and declaration compatibility entries |
| `pnpm size:check` | Enforce the 3072-byte transitive core gzip limit after building |
| `pnpm check` | Run the complete local quality gate, including a fresh build |
| `pnpm commit` | Create a Conventional Commit using Commitizen |
| `pnpm changeset` | Describe a user-facing change and its version impact |
| `pnpm version:packages` | Apply changesets, update the lockfile and regenerate the scoped CLI fixture |
| `pnpm test:generated` | Regenerate and compare the pinned OpenAPI fixtures |
| `pnpm test:browser` | Run Chromium integration after building and installing its browser |
| `pnpm benchmark` | Rebuild and measure type scale, runtime overhead and comparable bundle sizes |
| `pnpm clean` | Remove build and coverage output |

`test:package` needs `pnpm build` first. It packs and installs the package in a temporary directory, verifies the file allowlist, and checks ESM/CJS imports plus NodeNext declaration resolution for core, strict and metadata, typed operations, mocked requests and real local HTTP. It does not publish anything.

## Choose the right check

`pnpm check` runs a fresh build/package lint first, followed by formatting, typed lint, generated-fixture freshness, TypeScript, runtime coverage, CLI regressions, migration/scoped checks, installed runtime/CLI tarball consumers, core gzip size, and TS 6/TS 7 type-scale/scoping gates. TS 7 also checks an isolated generator installation and installed declarations. It excludes the separate Chromium suite and runtime/size/metadata microbenchmarks.

For a focused behavior change, run its Vitest file during iteration, then the full gate before submitting. For documentation, check links/anchors and typecheck examples against their actual generated schema; keep measured claims tied to a dated verification report. `pnpm format` formats the whole repository, so inspect the diff and avoid including unrelated formatting changes.

For transport or browser behavior:

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

On Linux CI, the workflow uses `pnpm exec playwright install --with-deps chromium`. The suite starts local loopback servers and checks real Chromium Fetch behavior, including multipart, CORS/cookies, cancellation, binary and streaming responses. It does not qualify Firefox or WebKit.

For schema changes, run `pnpm generate:example`, format the generated declarations, then `pnpm test:generated` and `pnpm typecheck`. The Petstore, Items and conformance fixtures use that workflow. The scoped catalog uses `pnpm generate:scoped` and `pnpm test:scoped` through the official CLI; its generated directory must not be reformatted. For performance changes, use `pnpm benchmark`; see [measurement methods](performance.md). Runtime/metadata timings are observations, not CI timing gates.

## Project conventions

- Add exports to the appropriate public entry: `packages/core/src/index.ts`, `packages/core/src/strict.ts` or `packages/core/src/metadata.ts`. Keep strict/compiler imports out of core. Put behavior tests in `test/*.test.ts` and compile-time regressions in `test/*.typecheck.ts`.
- Use explicit `.js` extensions for relative TypeScript imports under NodeNext.
- The runtime package has no dependencies. The separate `packages/cli/` workspace owns Node-only generation dependencies and pins a private TypeScript 5.9.3 compatible with its generator. Keep those dependencies out of runtime entries.
- TypeScript 6.0.3 remains the compiler API/build dependency; `typescript7` is a pinned npm alias to TypeScript 7.0.2 for the recommended performance baseline. Both are checked. Use named scripts, not bare `tsc`, because their executable names collide. `pnpm-workspace.yaml` permits this exact version for openapi-typescript 7.13.0, whose declared peer range is `^5.x`, while retaining strict peer checks. Independent applications need their own [scoped configuration](getting-started.md#generator-and-typescript-compatibility). Compiler upgrades must pass declaration, generated fixture, installed-consumer and type-scale checks.
- Only built output and package metadata, README, license and an optional changelog ship from the core and query packages. The CLI ships its Node source; the legacy package ships only compatibility entry points.
- `pnpm install` installs Husky hooks. Pre-commit runs lint-staged; commit-msg runs commitlint. The full type-aware check runs in `pnpm check` and CI.
- `sideEffects: false` assumes library modules do not perform import-time side effects. Update the declaration if future modules require them.
- Dependency lifecycle scripts are denied by default. Review and explicitly allow any future dependency that needs a build script in `pnpm-workspace.yaml`.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor and release workflows.

## Release setup

Changesets v3 and its v2 GitHub Actions manage version PRs, changelogs, package artifacts, npm publication and GitHub releases. The workflow separates verification, packing and publication; only the publishing job has an OIDC permission.

The [release workflow](../.github/workflows/release.yml) runs on `main` and supports an existing `v<core version>` tag for recovery. During the new npm scope bootstrap it is gated by the repository variable `SCOPED_PUBLISH_ENABLED=true`; this prevents a Changesets publish job from trying to publish packages before npm can authorize them.

1. Review the four package versions, `pnpm changeset status`, the packed artifacts, and the public registry versions. Run `pnpm check` and the Chromium suite first.
2. Authenticate as a maintainer of the `openapi-chain` npm organization. The repository contains `@openapi-chain/core`, `@openapi-chain/cli`, `@openapi-chain/query`, and the compatibility package `openapi-chain`. Each first release is a real public publish; publish the scoped core first, then the CLI, query adapter, and compatibility package. Use the package's current version and public access. The CLI and compatibility package require the scoped core version to be available on npm.
3. For **each** package, configure a Trusted Publisher in its npm package settings: GitHub owner `jskits`, repository `openapi-chain`, workflow filename `release.yml`, no environment name, and direct `npm publish` allowed. Publishing authorization is per package; the old package's publisher does not authorize the new scoped packages.
4. In GitHub Actions settings, enable **Allow GitHub Actions to create and approve pull requests**. Set the repository variable `SCOPED_PUBLISH_ENABLED=true` only after all four packages and Trusted Publishers are ready. Releases are enabled by default after that; set `RELEASE_ENABLED=false` for an emergency stop.

Local tarball checks do not prove npm publication or organization ownership. The first public publish requires a maintainer login; this checkout intentionally cannot publish while unauthenticated. `version:packages` versions all packages through Changesets and refreshes the generated scoped fixture. The `v<version>` tag recovery path validates the core package version; use the normal Changesets flow for independent CLI and query releases.

Pushing changesets to `main` creates or updates a release PR. Merging the release PR triggers the full CI matrix and Chromium integration before packaging and publishing. Only the publish job receives `id-token: write`. It publishes the packed artifact with lifecycle scripts disabled, then creates Git tags and GitHub releases. The workflow requires the publish-plan and package artifact IDs so a missing artifact cannot fall back to publishing from the checkout.

The pinned Node.js version provides npm; the publish job checks npm is at least `11.5.1`, as required for Trusted Publishing. pnpm 10 delegates tarball publication to that npm CLI. Authentication uses OIDC, with no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `setup-node` `registry-url` configuration. Provenance is enabled explicitly. If the npm Trusted Publisher uses an environment name, add the exact same `environment` to the publish job before running it.

After a release, check the Actions publication summary, npm version/provenance, Git tag and GitHub release. If publication succeeds but tag or GitHub release creation fails, inspect those remote states before retrying; do not bump the version or replace an existing tag merely to retry a failed run.

PRs created using GitHub's default token do not automatically start other workflows. If branch protection requires CI on the release PR, manually run CI on its branch using `workflow_dispatch`, or configure a GitHub App token for the version action.

### Recover a release PR permission failure

If the Changesets version step reports `GitHub Actions is not permitted to create or approve pull requests`, version generation may already have succeeded and the release branch may already have been pushed. The failure is the repository policy for Actions-created PRs, not npm authentication or the package version.

In **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. Keep the default token permissions read-only: the `version` job already declares `contents: write` and `pull-requests: write`, but those declarations do not override the separate repository policy. An organization administrator must resolve an inherited restriction if the checkbox cannot be enabled.

After correcting the setting, rerun the failed jobs and confirm that Changesets creates or updates the release PR. Do not bump the package version, delete the release branch, merge the release PR, or change npm credentials merely to retry this failure. A successful `version` job prepares a PR; publication follows only after the release PR is merged and the publish path passes verification.

The workflow adds recovery guidance to the job summary when the version action fails, while preserving the original failure status. It does not query or change repository administration settings using `GITHUB_TOKEN`; that endpoint requires administration access beyond this job's permissions. See [GitHub's workflow-permissions API](https://docs.github.com/en/rest/actions/permissions#get-default-workflow-permissions-for-a-repository).

Reference: [Changesets automation](https://changesets.dev/guide/automating), [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [tsdown package validation](https://tsdown.dev/options/lint).

## Query adapter package

`pnpm build` builds both runtime and the separate `@openapi-chain/query` package. `pnpm test:query:package` installs packed artifacts into a fresh consumer, checks ESM/CommonJS and TanStack/SWR types, performs real HTTP requests and checks browser bundle isolation. `pnpm check` repeats consumer verification with TS 6 and TS 7. Changesets includes this workspace package; the release packing job builds it through the root build command. The adapter has no runtime dependencies and does not alter the core gzip budget.
