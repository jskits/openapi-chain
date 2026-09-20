# Path and reference qualification

[Archive index](README.md) · [Current documentation](../../README.md)

Historical baseline: [verified implementation](https://github.com/jskits/openapi-chain/commit/6efd6dc3b09a386e4417628e76f486c8a815222c). Results below apply only to this baseline and the recorded environment; they are not a statement of current support or release status.

For the subsequent multipart fixes and later local results, see the [multipart qualification](multipart-qualification.md).

Local verification: 2026-09-20 (Asia/Shanghai), macOS arm64, Node 24.16.0, pnpm 10.34.5.

## Changes

- Preserve literal replacement tokens in core paths.
- Distinguish schema node identity from repeated reference targets.
- Extend static-path and nested-reference wire invariance.
- Qualify shared-prefix projects and incremental type checking.
- Document schema inference support and application responsibilities.

## Verified locally

- `pnpm check` passed, including generated fixtures, typed lint, TypeScript, coverage, build, publint, attw, installed-package consumers and type budgets.
- 299 tests passed across 26 files. Coverage: statements 96%, branches 94.05%, functions 98.07%, lines 97.01%.
- Schema wire-invariance coverage now exercises 240 combinations across five value kinds, three OpenAPI versions, eight schema forms and two media-declaration variants. Static paths are checked through native Request URLs in both clients.
- Chromium passed core/strict modules, multipart, Unicode, credentialed CORS, cookie omission, cancellation and streamed response extensions.
- Core transitive gzip: 1961 / 2048 bytes.
- Shared-DAG metadata compilation remains bounded; depth 20 took 0.24 ms and depth 28 took 0.26 ms in this run. Timings are illustrative, not gates.
- Existing 5000-route / 25-operation type fixture: 1888300 instantiations, 875713 KB memory and 2.44 s check time.
- New 1000-route shared-prefix project with 200 calls and response unions: 2580745 instantiations, 345308 KB memory, 3.07 s cold check. An unchanged incremental build took 0.20 s total; adding a checked call took 3.10 s check time. This measures CLI incremental builds, not editor completion latency.

## Release rehearsal

A temporary copy of tracked sources plus the new Changeset successfully ran:

1. Changesets version generation, producing `0.1.0` and its changelog.
2. Lockfile-only installation with lifecycle scripts disabled.
3. Build with declaration and package lint checks.
4. `pnpm test:package` against the versioned package.

The `openapi-chain-0.1.0.tgz` consumer check verified 31 package files, all public ESM/CommonJS entries, generated NodeNext consumers and real HTTP behavior. The rehearsal reused local development dependencies; it was not a clean remote installation. The working repository version remains managed by the existing Changesets release workflow; the rehearsal did not consume its pending Changesets.

No push, release-variable change, tag creation or npm publication was performed. Local package qualification does not establish remote OS/Node matrix results, OIDC configuration, registry availability or published-consumer behavior.

## Remaining delivery steps

After push/publication is authorized, verify the CI results for the pushed baseline, inspect the Changesets version PR and its `0.1.0` artifacts, and use the existing gated release workflow. Confirm npm metadata/provenance and install the registry package into clean ESM/CJS consumers after publication. Do not infer registry delivery from a successful local tarball test.

See the [schema inference matrix](../../support.md#schema-inference-matrix) and [type-performance methodology](../../performance.md) for the remaining product limits.
