# openapi-chain

A TypeScript library for chainable OpenAPI clients, currently being rebuilt.
This repository contains the engineering foundation only; `src/index.ts` has no public API yet.
The package starts at `0.0.0` under the new `openapi-chain` name.

## Development

Use Node.js **24.16.0** (see `.node-version`) and **pnpm 10.34.5**.
CI also checks Node.js 22.22.1 and 26, plus Windows and macOS on Node.js 24.

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install
pnpm check
```

If your Node.js installation does not include Corepack, install pnpm 10.34.5 using
the [pnpm installation guide](https://pnpm.io/installation).

| Command                             | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                          | Rebuild the library on changes                                          |
| `pnpm build`                        | Build ESM, CommonJS, declarations and source maps; run publint and attw |
| `pnpm lint` / `pnpm lint:fix`       | Oxlint checks, including type-aware rules; optional fixes               |
| `pnpm format` / `pnpm format:check` | Format or check using Oxfmt                                             |
| `pnpm typecheck`                    | Strict TypeScript checks for source, tests and TS configs               |
| `pnpm test` / `pnpm test:watch`     | Run Vitest once or in watch mode                                        |
| `pnpm test:coverage`                | Run tests with V8 coverage and 90% thresholds                           |
| `pnpm test:package`                 | Verify the built tarball in an isolated consumer                        |
| `pnpm check`                        | Run the complete local quality gate, including a fresh build            |
| `pnpm commit`                       | Create a Conventional Commit using Commitizen                           |
| `pnpm changeset`                    | Describe a user-facing change and its version impact                    |
| `pnpm version:packages`             | Apply changesets and update the lockfile                                |
| `pnpm clean`                        | Remove build and coverage output                                        |

`test:package` needs `pnpm build` first. It packs and installs the package in a
temporary directory, verifies the file allowlist, and checks ESM/CJS imports plus
NodeNext declaration resolution. It does not publish anything.

## Project conventions

- Add public exports in `src/index.ts`; put behavior tests in `test/*.test.ts`.
- Use explicit `.js` extensions for relative TypeScript imports under NodeNext.
- Keep runtime dependencies deliberate; there are currently none.
- TypeScript is pinned to 6.0.3 because tsdown reports its TypeScript 7 API integration
  as experimental. Upgrade after validating declaration output and consumers.
- Only `dist`, package metadata, README, license and an optional changelog ship to npm.
- `pnpm install` installs Husky hooks. Pre-commit runs lint-staged; commit-msg runs
  commitlint. The full type-aware check runs in `pnpm check` and CI.
- `sideEffects: false` assumes library modules do not perform import-time side effects.
  Update the declaration if future modules require them.
- The initial test checks entry loading only. Coverage on an empty source module is
  not evidence of functional API coverage; add meaningful tests with the implementation.
- Dependency lifecycle scripts are denied by default. Review and explicitly allow
  any future dependency that needs a build script in `pnpm-workspace.yaml`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor and release workflows.

## Release setup

Changesets v3 and its v2 GitHub Actions manage version PRs, changelogs, package
artifacts, npm publication and GitHub releases. The workflow separates verification,
packing and publication; only the publishing job has an OIDC permission.

Before enabling `.github/workflows/release.yml`:

1. Implement the initial API and add a minor changeset for the first `0.1.0` release.
2. Confirm ownership of the npm package name `openapi-chain`. If the package does
   not exist, create its first release with an authenticated maintainer account.
   For a local first publish, use `npm publish --provenance=false` after `pnpm check`.
3. Configure an npm **Trusted Publisher** with organization/user `jskits`, repository
   `openapi-chain`, workflow `release.yml`, and no environment name.
4. In GitHub Actions settings, enable **Allow GitHub Actions to create and approve
   pull requests**. Add a repository variable `RELEASE_ENABLED` with value `true`.

Once enabled, pushing changesets to `main` creates or updates a release PR.
Merging the release PR triggers the full CI matrix before packaging and publishing.
No long-lived npm token is needed for this OIDC workflow. Do not enable releases
while the package is still an empty scaffold.

PRs created using GitHub's default token do not automatically start other workflows.
If branch protection requires CI on the release PR, manually run CI on its branch
using `workflow_dispatch`, or configure a GitHub App token for the version action.

Reference: [Changesets automation](https://changesets.dev/guide/automating),
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[tsdown package validation](https://tsdown.dev/options/lint).

## License

[MIT](./LICENSE)
