# Development

[Documentation index](README.md) · [Contributing](../CONTRIBUTING.md) · [Architecture](architecture.md)

Use Node.js **24.16.0** (see `.node-version`) and **pnpm 10.34.5**. CI also checks Node.js 22.22.1 and 26, plus Windows and macOS on Node.js 24.

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
| `pnpm build` | Build ESM, CommonJS, declarations and source maps; run publint and attw |
| `pnpm lint` / `pnpm lint:fix` | Oxlint checks, including type-aware rules; optional fixes |
| `pnpm format` / `pnpm format:check` | Format or check using Oxfmt |
| `pnpm typecheck` | Strict TypeScript checks for source, tests, examples and TS configs |
| `pnpm test` / `pnpm test:watch` | Run Vitest once or in watch mode |
| `pnpm test:coverage` | Run tests with V8 coverage and 90% thresholds |
| `pnpm test:package` / `pnpm verify:package` | Verify all three entries in an isolated tarball consumer |
| `pnpm size:check` | Enforce the 2048-byte transitive core gzip limit after building |
| `pnpm check` | Run the complete local quality gate, including a fresh build |
| `pnpm commit` | Create a Conventional Commit using Commitizen |
| `pnpm changeset` | Describe a user-facing change and its version impact |
| `pnpm version:packages` | Apply changesets and update the lockfile |
| `pnpm test:generated` | Regenerate and compare the pinned OpenAPI fixtures |
| `pnpm test:browser` | Run Chromium integration after building and installing its browser |
| `pnpm benchmark` | Rebuild and measure type scale, runtime overhead and comparable bundle sizes |
| `pnpm clean` | Remove build and coverage output |

`test:package` needs `pnpm build` first. It packs and installs the package in a temporary directory, verifies the file allowlist, and checks ESM/CJS imports plus NodeNext declaration resolution for core, strict and metadata, typed operations, mocked requests and real local HTTP. It does not publish anything.

## Choose the right check

`pnpm check` runs, in order: formatting, typed lint, generated-fixture freshness, TypeScript, tests with coverage, build/package lint, installed-tarball consumers, core gzip size, and both type-scale benchmarks. It excludes the separate Chromium suite and runtime/size/metadata microbenchmarks.

For a focused behavior change, run its Vitest file during iteration, then the full gate before submitting. For documentation, check links/anchors and typecheck examples against their actual generated schema; keep measured claims tied to a dated verification report. `pnpm format` formats the whole repository, so inspect the diff and avoid including unrelated formatting changes.

For transport or browser behavior:

```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

On Linux CI, the workflow uses `pnpm exec playwright install --with-deps chromium`. The suite starts local loopback servers and checks real Chromium Fetch behavior, including multipart, CORS/cookies, cancellation, binary and streaming responses. It does not qualify Firefox or WebKit.

For schema changes, run `pnpm generate:example`, format the generated declarations, then `pnpm test:generated` and `pnpm typecheck`. All three fixtures (Petstore, Items and conformance) are checked. For performance changes, use `pnpm benchmark`; see [measurement methods](performance.md). Runtime/metadata timings are observations, not CI timing gates.

## Project conventions

- Add exports to the appropriate public entry: `src/index.ts`, `src/strict.ts` or `src/metadata.ts`. Keep strict/compiler imports out of core. Put behavior tests in `test/*.test.ts` and compile-time regressions in `test/*.typecheck.ts`.
- Use explicit `.js` extensions for relative TypeScript imports under NodeNext.
- Keep runtime dependencies deliberate; there are currently none.
- TypeScript is pinned to 6.0.3. `pnpm-workspace.yaml` permits this exact version for openapi-typescript 7.13.0, whose declared peer range is `^5.x`, while retaining strict peer checks. Independent applications need their own [scoped configuration](getting-started.md#generator-and-typescript-compatibility). Compiler upgrades must pass declaration, generated fixture, installed-consumer and type-scale checks.
- Only `dist`, package metadata, README, license and an optional changelog ship to npm.
- `pnpm install` installs Husky hooks. Pre-commit runs lint-staged; commit-msg runs commitlint. The full type-aware check runs in `pnpm check` and CI.
- `sideEffects: false` assumes library modules do not perform import-time side effects. Update the declaration if future modules require them.
- Dependency lifecycle scripts are denied by default. Review and explicitly allow any future dependency that needs a build script in `pnpm-workspace.yaml`.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor and release workflows.

## Release setup

Changesets v3 and its v2 GitHub Actions manage version PRs, changelogs, package artifacts, npm publication and GitHub releases. The workflow separates verification, packing and publication; only the publishing job has an OIDC permission.

Before enabling [the release workflow](../.github/workflows/release.yml):

1. Review pending changesets and the resulting version/changelog. This checkout is `0.0.0`; verify the actual registry versions before choosing the release version, especially when a package name has historical releases.
2. Confirm ownership of the npm package name `openapi-chain`. If the package does not exist, create its first release with an authenticated maintainer account. A local bootstrap publish requires maintainer authentication and a deliberate version choice; `npm publish --provenance=false` is a real publishing command, not a validation step. Run the full checks and review the packed files first.
3. Configure an npm **Trusted Publisher** with organization/user `jskits`, repository `openapi-chain`, workflow `release.yml`, and no environment name.
4. In GitHub Actions settings, enable **Allow GitHub Actions to create and approve pull requests**. Add a repository variable `RELEASE_ENABLED` with value `true`.

Once enabled, pushing changesets to `main` creates or updates a release PR. Merging the release PR triggers the full CI matrix before packaging and publishing. Only the publish job receives `id-token: write`. No long-lived npm token is needed for this OIDC workflow. Enable releases only after package ownership and Trusted Publishing are configured.

PRs created using GitHub's default token do not automatically start other workflows. If branch protection requires CI on the release PR, manually run CI on its branch using `workflow_dispatch`, or configure a GitHub App token for the version action.

Reference: [Changesets automation](https://changesets.dev/guide/automating), [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [tsdown package validation](https://tsdown.dev/options/lint).
