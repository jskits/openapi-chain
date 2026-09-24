# GitHub REST OpenAPI consumer probe (2026-09-24)

Baseline: [`3542d64`](https://github.com/jskits/openapi-chain/commit/3542d64) after the onboarding, conformance-test and Query type fixes. This is a dated consumer observation, not a continuing compatibility promise for GitHub's API.

The source was GitHub's [REST API OpenAPI description](https://docs.github.com/en/rest/about-the-rest-api/about-the-openapi-description-for-the-rest-api), pinned to [`github/rest-api-description@4377b4f`](https://github.com/github/rest-api-description/blob/4377b4f4845badf28d13464dfb3042c6cf0e3a1f/descriptions/api.github.com/api.github.com.json). The downloaded file's SHA-256 was `b8ca03764f54058ec40e2b61e048a4518ee88e943ac04d393b1757094c895aad`; its Git blob ID matched the pinned commit. It is an OpenAPI 3.0.3 document with 808 path keys and 12,964,430 bytes. The document is not copied into this repository.

## Reproduction

Use Node 24.16.0 and pnpm 10.34.5 from the repository root. Download the pinned description, then create a config beside it:

```sh
mkdir -p /tmp/openapi-chain-github-e2e
curl -fLsS 'https://raw.githubusercontent.com/github/rest-api-description/4377b4f4845badf28d13464dfb3042c6cf0e3a1f/descriptions/api.github.com/api.github.com.json' -o /tmp/openapi-chain-github-e2e/openapi.json
shasum -a 256 /tmp/openapi-chain-github-e2e/openapi.json
```

```json
{
  "schema": "./openapi.json",
  "outDir": "./generated",
  "paths": ["/repos/{owner}/{repo}", "/repos/{owner}/{repo}/issues/{issue_number}"]
}
```

Save that JSON as `/tmp/openapi-chain-github-e2e/openapi-chain.config.json`, then run:

```sh
pnpm build
node packages/cli/src/cli.mjs generate --config /tmp/openapi-chain-github-e2e/openapi-chain.config.json
node packages/cli/src/cli.mjs generate --config /tmp/openapi-chain-github-e2e/openapi-chain.config.json --check
pnpm --dir packages/core pack --out /tmp/openapi-chain-github-e2e/openapi-chain.tgz
pnpm --dir packages/query pack --out /tmp/openapi-chain-github-e2e/openapi-chain-query.tgz
```

Install both tarballs and TypeScript in a separate application directory. Type-check a client importing `ScopedPaths` from `generated/scope.ts` and `metadata` from `generated/metadata.ts`, with calls to `api.repos('jskits')('openapi-chain').get()` and `api.repos('jskits')('openapi-chain').issues(1).get()`. Check that an unselected `api.user.get()` and a string issue number fail type checking. Run a local HTTP server to observe `GET /repos/jskits/openapi-chain`, and wrap the GET in `createQuery()` with TanStack Query to check that mutating the original input after options creation does not change the request or cache identity.

## Observed results and friction

- Generation and `--check` succeeded. The full `schema.d.ts` was 6,528,252 bytes, while selected `metadata.ts` was 1,890 bytes. Scope reduces the exposed client tree and metadata, but the CLI still generates declarations for the complete source document.
- Changing only `info.version` in the source caused `--check` to report stale `manifest.json`; restoring the original file made it pass again. Adding a required `revision` query parameter to the selected repository GET caused `--check` to report stale declarations, metadata and manifest. After regeneration, the old consumer failed TypeScript checking because its GET omitted the new required input. This verifies both source drift detection and a meaningful contract-upgrade failure.
- An isolated tarball consumer passed TypeScript 6.0.3 checking with positive path calls and negative unselected-path and issue-number assertions. The installed Strict client sent the expected request to a local HTTP server. Its Query adapter reused the cached result for the same key and preserved the original input snapshot.
- A read-only GET through the installed Strict client returned `full_name: jskits/openapi-chain` from the live GitHub API. Node's direct Fetch connection timed out in this environment; enabling Node's environment proxy support with `NODE_USE_ENV_PROXY=1` allowed that live request. This is an environment setup issue, not a client serialization failure.

The probe covers two selected paths and GET requests. It does not validate GitHub's response bodies at runtime, authenticate, exercise all 808 paths, or establish editor responsiveness, long-term compatibility, or production adoption. Large third-party descriptions still incur the cost of generating and storing full declarations, even for a small selected scope.
