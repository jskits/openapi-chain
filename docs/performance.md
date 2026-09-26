# Performance and measurement

[Documentation index](README.md) · [Support matrix](support.md)

Run `pnpm benchmark` to build fresh artifacts and reproduce the default-compiler benchmark scenarios. TS 7 is the recommended performance baseline; both compiler versions are pinned and checked in CI using the commands below. The pinned reference client is `openapi-fetch` 0.17.0; TypeScript and tsdown use the versions in `package.json`. The historical samples below were recorded on 2026-09-20, on macOS arm64 with Node 24.16.0. They are not a cross-platform throughput guarantee or measurements of the current working tree.

See the archived [schema semantics report](archive/qualification/schema-semantics-qualification.md) for the baseline used by the original measurements and the [path and reference report](archive/qualification/path-reference-qualification.md) for the later shared-prefix type-checking scenario. The subsequent [media report](archive/qualification/media-qualification.md) records another core size. Use `pnpm build && pnpm size:check` to measure the checkout you are evaluating.

## Runtime

Each client uses the same Fetch replacement returning an empty HTTP 204 response. Each case performs 100 warmup requests, then five samples of 1000 requests; the reported value is the median in microseconds per request. Calls include chain or path selection on each iteration. There is no network, JSON parsing or server work.

| Routes | Core | Strict chain | Strict `$path()` | openapi-fetch |
| ------ | ---: | -----------: | ---------------: | ------------: |
| 10     | 1.45 |         2.27 |             1.65 |          2.72 |
| 1000   | 1.06 |         1.69 |             1.26 |          2.55 |
| 10000  | 1.16 |         1.81 |             1.26 |          2.11 |

The 10000-route metadata compile took about 10 ms and strict indexing about 16 ms. This setup cost is paid at client construction. Runtime figures include different client response wrappers and Request construction choices; they do not establish which library is faster for real applications. `test/routes.test.ts` guards against per-request route-table enumeration without relying on noisy timing thresholds.

## Type system

`pnpm benchmark:types` generates 100, 1000 and 5000 routes using modern generator parameter conventions and calls 25 distinct operations. Each call checks the response type; negative assertions retain required-query and path constraints.

| Routes | Instantiations | Compiler memory | Check time |
| ------ | -------------: | --------------: | ---------: |
| 100    |          70400 |         ~98 MiB |     0.18 s |
| 1000   |         404300 |        ~141 MiB |     0.58 s |
| 5000   |        1888300 |        ~857 MiB |     2.50 s |

The check runs in `pnpm check` and CI. Each scenario must stay below 3 million instantiations and 1200000 KB compiler memory. Wall-clock times are reported but not gated on shared runners. The 5000-route fixture is intentionally demanding; large applications should evaluate their actual schemas. It does not model all endpoints being used, complex response unions, or incremental IDE latency.

## Size

`pnpm benchmark:size` bundles each complete public runtime entry separately with the same tsdown version, ES2022 target, minifier, no source map and gzip level 9. Dependencies are bundled and each result must be a single file.

| Entry         | Minified bytes | Gzip bytes |
| ------------- | -------------: | ---------: |
| core          |           4221 |       1850 |
| strict        |          21046 |       6519 |
| metadata      |          13867 |       4517 |
| openapi-fetch |           7418 |       2833 |

These entries have different feature sets. Strict is an alternative to core; metadata compilation can run at build time, so neither entry must necessarily ship with every application. Consumer tree shaking can also change the result.

The separate `pnpm size:check` release gate uses a different stable metric: it concatenates reachable emitted core ESM chunks and gzips that text, including their source-map comments, with a 3584-byte limit. Neither metric equals the sum of separately compressed HTTP assets; compare like-for-like when publishing results.

## Shared schema graphs

`pnpm benchmark:metadata` measures complete small documents whose allOf branches reuse the same referenced subtree. Per-compilation memoization prevents repeated expansion; regression tests count observed reads instead of gating noisy timings.

| Shared-reference depth | Document bytes | Compile time |
| ---------------------- | -------------: | -----------: |
| 8                      |           1020 |      1.09 ms |
| 12                     |           1376 |      0.20 ms |
| 16                     |           1736 |      0.20 ms |
| 20                     |           2096 |      0.61 ms |
| 28                     |           2816 |      0.32 ms |

These individual samples include warmup/scheduling effects; deeper cases need not be slower. A 1,000,000-step traversal budget and 128-level depth limit remain active, including when subgraphs are cached. Compile large schemas at build time.

## Shared prefixes, response unions and incremental edits

The type benchmark also checks a 1000-route project with shared `/orgs/{org}/resources/rN/{id}` prefixes, 200 used operations, nested response objects and success-response unions. Negative assertions retain required inputs, path argument types and response-union safety. This runs in `pnpm check` with the same 3 million instantiation / 1200000 KB memory budgets.

A local Node 24.16.0 / TypeScript 6.0.3 run produced:

| Project phase          | Used operations | Instantiations | Memory KB | Check time | Total time |
| ---------------------- | --------------: | -------------: | --------: | ---------: | ---------: |
| Cold incremental build |             200 |        2580745 |    345360 |     3.07 s |     3.27 s |
| Unchanged build        |             200 |              0 |     82526 |     Cached |     0.20 s |
| Added operation call   |             201 |        2598785 |    309187 |     3.06 s |     3.27 s |

The edit adds a new checked operation call to the consumer module. Unchanged build caching is effective, but editing this module still requires substantial checking. These are CLI incremental-build measurements, not language-server completion latency or a guarantee for a real application's schema. Large users should measure their generated schemas and can partition clients by service or route subset to limit each type tree. The earlier 5000-route scenario remains a separate scale gate; this project scenario does not replace it.

## Current compiler and scoped-consumer measurements

Recorded 2026-09-21 on macOS arm64 / Node 24.16.0. Raw outputs, including every editor sample, are in [the measurement record](measurements/2026-09-21.json). The following figures use a **new fixed fixture** from `scripts/lib/type-fixture.mjs`, not the earlier historical tables. Both full and scoped consumers call the same 25 operations and check their responses. Scoping keeps the full declaration input but exposes 250 exact paths via Pick.

| Document routes | Selected routes | TypeScript | Instantiations | Memory KB | Check time |
| --------------- | --------------- | ---------- | -------------: | --------: | ---------: |
| 1000            | 1000            | 6.0.3      |         402889 |    190330 |     0.57 s |
| 1000            | 1000            | 7.0.2      |         402886 |     72687 |    0.201 s |
| 5000            | 5000            | 6.0.3      |        1886889 |    871176 |     2.46 s |
| 5000            | 5000            | 7.0.2      |        1886886 |    256573 |    1.171 s |
| 5000            | 250             | 6.0.3      |         125645 |    178035 |     0.31 s |
| 5000            | 250             | 7.0.2      |         125642 |    100615 |    0.113 s |

These recorded figures originally used a separately installed TS 7.0.2. It is now a pinned `typescript7` alias: source type checks, installed ESM/CommonJS declaration consumers and all type-complexity scenarios run on both versions in CI. Generation and declaration building continue using the TS 6 toolchain; the isolated TS 7 consumer test verifies the documented dual-version generator setup, not a wholesale build-tool migration. Compiler times here are individual process measurements, not latency guarantees. Instantiations remain almost equal across these two versions on this fixture, but that is not a cross-version invariant for all programs.

`pnpm benchmark:scoping` also varies the call count on the 1000-route fixture:

| Checked calls | TS 6 instantiations | Check time |
| ------------- | ------------------: | ---------: |
| 1             |              165193 |     0.27 s |
| 5             |              204809 |     0.33 s |
| 25            |              402889 |     0.57 s |
| 100           |             1145689 |     1.51 s |

One call still incurs substantial schema-wide work. Call count, route shape and response complexity also matter; do not extrapolate a universal linear formula. The scoped fixture is gated on valid positive/negative types, instantiation and memory limits, and lower instantiation work than its full counterpart in `pnpm check`. Use the [single-scope recipe](large-schemas.md) for a runnable setup.

## Editor completion latency

`pnpm benchmark:editor --compiler=ts6` drives real TS 6 tsserver requests; `pnpm benchmark:editor:ts7` uses the pinned TS 7 native LSP. For each scenario it starts three fresh servers, opens the same consumer, requests root-chain completion, repeats without edits, changes one comment character and requests completion again. The edited interval includes submitting the edit. Cold timing starts at the first completion request after opening the file, not at OS process creation. The same incremental edit is used in both protocols. Returned route names and exclusion of unselected routes are asserted.

| Compiler         | Document / selected routes | Cold median | Unchanged median | Edited median |
| ---------------- | -------------------------- | ----------: | ---------------: | ------------: |
| 6.0.3 tsserver   | 1000 / 1000                |    511.8 ms |           5.1 ms |      211.0 ms |
| 6.0.3 tsserver   | 5000 / 5000                |   1096.7 ms |          17.3 ms |      751.3 ms |
| 6.0.3 tsserver   | 5000 / 250                 |    498.0 ms |           1.6 ms |      132.1 ms |
| 7.0.2 native LSP | 1000 / 1000                |    110.7 ms |           2.7 ms |       91.0 ms |
| 7.0.2 native LSP | 5000 / 5000                |    489.1 ms |          12.5 ms |      483.3 ms |
| 7.0.2 native LSP | 5000 / 250                 |     83.2 ms |           1.2 ms |       73.4 ms |

These are three-sample medians on a synthetic root completion, not IDE-wide responsiveness, competing-client benchmarks or a promise for deep nodes and semantic edits. The measured improvement does not equal the instantiation ratio. Run these timing benchmarks separately from other CPU-heavy work. Timing is not a shared-runner CI gate; stalled/failed protocol requests do fail the script.

## Reproduce and gate both compiler versions

After `pnpm install --frozen-lockfile && pnpm build`, use:

```sh
pnpm typecheck
pnpm typecheck:ts7
pnpm benchmark:types
pnpm benchmark:scoping --compiler=ts6
pnpm benchmark:types:ts7
pnpm benchmark:editor --compiler=ts6
pnpm benchmark:editor:ts7
pnpm test:package:ts7
```

`benchmark:types:ts7` covers flat routes, shared prefixes/response unions with cold/unchanged/edited builds, and the scope/call-count fixture. The fixture inputs and semantic assertions are shared across versions. TS 7 type benchmarks explicitly use four checkers. Every benchmark reports the actual compiler version and the type-complexity scripts also report platform, worker setting and budget.

`pnpm check` runs the TS 6 gates and then `pnpm check:ts7`; the latter requires a fresh build and covers source types, installed consumers (including independently generated declarations) and all three TS 7 type benchmarks. The existing CI Node/OS matrix runs both compiler versions. A Linux/Node 24 job also runs both editor protocols sequentially, validating returned completions and retaining sample timings in its logs. Elapsed time is reported, not used as a regression threshold on shared runners.

Budgets are separate named records in `scripts/lib/compiler.mjs`. Initially each version uses the established ceiling of fewer than 3,000,000 instantiations and 1,200,000 KB compiler memory. Missing metrics and changed programs reporting zero work fail. Scoping must reduce instantiations for the same calls. There is no cross-compiler equality or speed-ratio assertion. If a compiler update changes metric semantics, review its budget explicitly rather than silently weakening both versions' gates.

Named `--compiler=ts6` and `--compiler=ts7` runs resolve the package's own launcher, verify its pinned version and ignore executable overrides, avoiding `.bin/tsc` collisions. For separate experiments only, `OPENAPI_CHAIN_TSC` remains available when no named compiler is supplied; it must point to a native TS 7 CLI. Such results do not replace the pinned CI baseline.

## Metadata and consumer delivery

Library-entry size omits application metadata. `pnpm benchmark:delivery` bundles the same synthetic 1000-route document in three ways and executes a deepObject request through each resulting browser-target bundle. It verifies compiler inclusion/exclusion and that the scoped client rejects unselected routes.

| Delivery | Selected routes | Metadata gzip | Complete consumer gzip | Compiler included |
| --- | --: | --: | --: | --- |
| Compile in application | 1000 | 2981 B | 18665 B | Yes |
| Compile at build time | 1000 | 2981 B | 10549 B | No |
| Compile at build time, scoped | 50 | 282 B | 7092 B | No |

The document alone is 6602 B gzip. Consumer figures compress the whole bundle; they are not sums of separately compressed entry and metadata values. These synthetic schemas compress extremely well and do not establish ratios for Stripe or a representative public API corpus. The scoped scenario intentionally changes the exposed API while preserving the exercised operation. Full metadata retains uncalled routes because the client indexes a dynamic operation table.

Build-time delivery eliminates shipping the compiler and document. Server targets can also benefit in artifact size, initialization and memory, even when browser transfer is not a concern. Neither approach removes the runtime route index or makes cost proportional to inferred source-code call sites.

For the historical 2026-09-21 emitted-entry measurement: core 1916 B, strict 6789 B, metadata 4673 B gzip. That historical core transitive release gate reported 2046 / 2048 B; the current safety budget is 3584 B. Historical tables above remain labeled historical; do not mix their method or baseline with these numbers. The [serializer-profile experiment](serializer-profiles.md) records why no new reduced strict entry is published in this iteration.

The September 24 runtime-hardening implementation measures **3020 B transitive gzip** with the size gate's emitted-module method. The current gate is **3584 B (3.5 KiB)**. The increase includes URL boundary validation, shared query and response contracts, guarded JSON serialization, plain-record and cross-realm native-body checks, and stable error codes with operation context. This replaces the intermediate 2560 B safety budget; it does not revise the historical benchmark tables.

The September 26 core structured-value guard adds 107 B over the preceding 3060 B build: **3167 B transitive gzip**. The 3584 B budget retains space for maintenance and correctness fixes. Budget changes require an explained measurement and review; strict/compiler code remains outside this entry.
