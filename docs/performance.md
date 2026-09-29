# Performance and measurement

[Documentation index](README.md) · [Support matrix](support.md)

Run `pnpm benchmark` to build fresh artifacts and reproduce the default-compiler benchmark scenarios. TS 7 is the recommended performance baseline; both compiler versions are pinned and checked in CI using the commands below. The pinned reference client is `openapi-fetch` 0.17.0; the [client comparison](#comparison-with-other-clients) also pins `openapi-typescript-fetch`, `feature-fetch`, `axios` and `superagent`. TypeScript and tsdown use the versions in `package.json`. The runtime, size and comparison tables were recorded on 2026-09-29; the type-system and editor tables below remain historical samples from 2026-09-20 and 2026-09-21. All were recorded on macOS arm64 with Node 24.16.0. They are not a cross-platform throughput guarantee or measurements of the current working tree.

See the archived [schema semantics report](archive/qualification/schema-semantics-qualification.md) for the baseline used by the original measurements and the [path and reference report](archive/qualification/path-reference-qualification.md) for the later shared-prefix type-checking scenario. The subsequent [media report](archive/qualification/media-qualification.md) records another core size. Use `pnpm build && pnpm size:check` to measure the checkout you are evaluating.

## Runtime

Each client uses the same Fetch replacement returning an empty HTTP 204 response. Each case performs 100 warmup requests, then five samples of 1000 requests; the reported value is the median in microseconds per request. Calls include chain or path selection on each iteration. There is no network, JSON parsing or server work.

| Routes | Core | Strict chain | Strict `$path()` | openapi-fetch |
| ------ | ---: | -----------: | ---------------: | ------------: |
| 10     | 2.17 |         3.39 |             2.08 |          2.60 |
| 1000   | 1.59 |         2.54 |             1.96 |          2.42 |
| 10000  | 1.94 |         2.72 |             2.00 |          2.10 |

Each cell is the median of three script runs. The 2026-09-20 table (core 1.06-1.45 µs) predates the September 24 runtime hardening; it is superseded rather than comparable. The 10000-route metadata compile took about 12 ms and strict indexing about 33 ms. This setup cost is paid at client construction. Runtime figures include different client response wrappers and Request construction choices; they do not establish which library is faster for real applications. `test/routes.test.ts` guards against per-request route-table enumeration without relying on noisy timing thresholds.

## Type system

`pnpm benchmark:types` generates 100, 1000 and 5000 routes using modern generator parameter conventions and calls 25 distinct operations. Each call checks the response type; negative assertions retain required-query and path constraints.

| Routes | Instantiations | Compiler memory | Check time |
| ------ | -------------: | --------------: | ---------: |
| 100    |          70400 |         ~98 MiB |     0.18 s |
| 1000   |         404300 |        ~141 MiB |     0.58 s |
| 5000   |        1888300 |        ~857 MiB |     2.50 s |

The check runs in `pnpm check` and CI. Each scenario must stay below 3 million instantiations and 1200000 KB compiler memory. Wall-clock times are reported but not gated on shared runners. The 5000-route fixture is intentionally demanding; large applications should evaluate their actual schemas. It does not model all endpoints being used, complex response unions, or incremental IDE latency.

## Size

`pnpm benchmark:size` bundles one entry module per client with the same tsdown version, browser platform conditions, ES2022 target, minifier, no source map and gzip level 9. Each entry imports only the client factory an application uses (for example `createClient` and `HttpError`, or openapi-fetch's default export), so consumer tree shaking applies equally. Dependencies are bundled and each result must be a single file.

| Entry                                  | Minified bytes | Gzip bytes |
| -------------------------------------- | -------------: | ---------: |
| openapi-chain core                     |           7061 |       3046 |
| openapi-chain strict                   |          27627 |       8611 |
| openapi-chain metadata compiler        |          18415 |       6045 |
| openapi-chain openapi-fetch adapter    |          24036 |       7355 |
| openapi-fetch                          |           6540 |       2532 |
| openapi-typescript-fetch               |           2678 |       1232 |
| feature-fetch (`createApiFetchClient`) |          13913 |       4768 |
| axios                                  |          50282 |      18629 |
| superagent                             |          63471 |      19467 |

Before 2026-09-29 this benchmark bundled complete entry files on the neutral platform (core 4221 / 1850 B on 2026-09-20). The neutral platform cannot bundle the CommonJS competitors, and the core has since grown; do not compare the two tables.

These entries have different feature sets. Strict is an alternative to core; metadata compilation can run at build time, so neither entry must necessarily ship with every application. Consumer tree shaking can also change the result.

The separate `pnpm size:check` release gate uses a different stable metric: it concatenates reachable emitted core ESM chunks and gzips that text, including their source-map comments, with a 3584-byte limit. Neither metric equals the sum of separately compressed HTTP assets; compare like-for-like when publishing results.

## Comparison with other clients

`pnpm benchmark:competitors` compares request overhead under one method; `pnpm benchmark:competitors:types` compares type-checking cost on both pinned compilers. Every runtime case must first reach the Fetch mock or server exactly once and succeed, including libraries that return failures as values. Each suite runs in its own process; cases run in shuffled order, each round a 200 ms warmup plus a one-second timed loop, and the tables report the median round. The default is three rounds; the tables below used `--rounds=5`. Timing is informational and does not gate CI.

### Fetch mock

This suite mirrors openapi-fetch's own `test/bench` harness: global `fetch` resolves an empty JSON 200 response on `process.nextTick`. Calls include chain or path selection on each iteration. Higher is better; the ratio is relative to the fastest case.

| Client                          | GET only URL (ops/s) | GET with headers (ops/s) |
| ------------------------------- | -------------------: | -----------------------: |
| openapi-typescript-fetch 2.2.1  |       196240 (1.00×) |           140780 (1.03×) |
| openapi-fetch 0.17.0            |       167136 (1.17×) |           144359 (1.00×) |
| openapi-fetch path-based client |       163402 (1.20×) |           143896 (1.00×) |
| **openapi-chain core**          |   **164334 (1.19×)** |       **141077 (1.02×)** |
| openapi-chain core `$path()`    |       171395 (1.14×) |           138122 (1.05×) |
| openapi-chain strict            |       136517 (1.44×) |           122243 (1.18×) |
| feature-fetch 0.1.2             |        96328 (2.04×) |            93648 (1.54×) |
| axios 1.20.0, fetch adapter     |        29475 (6.66×) |            24992 (5.78×) |

The headers scenario sets one client default header and two per-request headers in each library's own input shape; openapi-chain passes undeclared headers through `init.headers`. Client construction has no request work: core creates about 7.5 million clients per second because its Proxy tree is lazy, 1.8× openapi-fetch. Strict indexes its compiled metadata at construction, so it creates about 276 thousand per second.

The same script on the preceding source measured core at 155433 and 120762 ops/s (1.29× and 1.17×). That build parsed the unchanged base URL on every request and built an intermediate `Headers` object for each merged header record; the base boundary is now reused and plain header records merge directly.

### Loopback HTTP

A child process serves `{}` over keep-alive HTTP on 127.0.0.1. Node's Fetch is used by the Fetch-based clients; axios's default adapter and superagent use `node:http` with a keep-alive agent.

| Client                               |     ops/s |  Relative |
| ------------------------------------ | --------: | --------: |
| superagent 10.4.1                    |     13404 |     1.00× |
| `fetch` + `response.json()` baseline |     12843 |     1.04× |
| **openapi-chain core**               | **12214** | **1.10×** |
| openapi-typescript-fetch             |     12160 |     1.10× |
| openapi-fetch                        |     12120 |     1.11× |
| openapi-chain strict                 |     11986 |     1.12× |
| feature-fetch                        |     11456 |     1.17× |
| axios, fetch adapter                 |      8348 |     1.61× |
| axios, `node:http` adapter           |      2157 |     6.21× |

With a real socket every Fetch-based client is within 10% of calling `fetch` directly, and their differences are within run-to-run noise. The axios `node:http` figure is roughly one millisecond per loopback request on macOS; treat it as an observation of this setup, not of axios's library overhead.

### Type checking

The types suite generates openapi-typescript-shaped paths with a required query and path parameter, then checks 25 used operations through each client's call style, including negative assertions for a missing query and a wrong path type.

| Routes | Compiler | openapi-chain instantiations | openapi-fetch instantiations | openapi-chain check | openapi-fetch check | Memory (chain / fetch) |
| --: | --- | --: | --: | --: | --: | --: |
| 100 | 6.0.3 | 85194 | 54517 | 0.20 s | 0.24 s | 113 / 113 MiB |
| 1000 | 6.0.3 | 473994 | 127417 | 0.64 s | 1.10 s | 157 / 197 MiB |
| 5000 | 6.0.3 | 2201994 | 451417 | 2.69 s | 5.10 s | 918 / 458 MiB |
| 100 | 7.0.2 | 85195 | 53108 | 0.040 s | 0.059 s | 34 / 35 MiB |
| 1000 | 7.0.2 | 473995 | 127808 | 0.253 s | 0.570 s | 85 / 83 MiB |
| 5000 | 7.0.2 | 2201995 | 459808 | 1.375 s | 3.783 s | 309 / 303 MiB |

openapi-chain performs about four to five times more instantiations for its prefix tree yet checks this fixture faster; with TS 6 at 5000 routes it uses about twice the memory. This synthetic fixture has uniform routes; the [real-schema measurements](#real-schemas) below do not show a uniform advantage. Check time is the median of three compiler runs; instantiations and memory come from that run. A [scoped client](large-schemas.md) reduces openapi-chain's work further; the comparison uses the full path set for both.

### Real schemas

`pnpm benchmark:real-schemas --compiler=ts6` and `--compiler=ts7` download two pinned public documents into `.cache/real-schemas`, verify their SHA-256, generate `paths` with the pinned openapi-typescript 7.13.0 and type-check the same operations through both clients:

| Document | Pinned revision | Operations | Paths | Generated declarations |
| --- | --- | --: | --: | --: |
| GitHub REST API 1.1.4 (OpenAPI 3.0.3) | `github/rest-api-description@2f44eac` | 1231 | 815 | 6.6 MB |
| Stripe API 2026-09-30.endive (OpenAPI 3.0.0) | `stripe/openapi@db67eb2` | 612 | 431 | 4.6 MB |

The script selects GET operations that a fluent chain can call with path arguments only: no other required inputs, no reserved segment names and exactly one `application/json` 200 response (562 GitHub and 239 Stripe operations). It takes an evenly spaced, sorted sample and asserts each call's success type: the 200 body for openapi-fetch's `data`, and the 200 body plus any `default` body for openapi-chain, which types undeclared 2xx statuses through `default`. Each consumer also keeps one negative path-input assertion. The full variant uses the generated `paths`; the scoped variant uses `Pick<paths, …>` of the called paths for both clients, as openapi-chain's CLI scope does.

40 called operations; check time is the median of three runs:

| Document | Paths type | Compiler | Instantiations (chain / fetch) | Check time (chain / fetch) | Memory (chain / fetch) |
| --- | --- | --- | --: | --: | --: |
| GitHub | Full | 6.0.3 | 931566 / 139336 | 1.09 s / 0.86 s | 355 / 235 MiB |
| GitHub | Full | 7.0.2 | 931567 / 139759 | 0.492 s / 0.349 s | 172 / 103 MiB |
| GitHub | Scoped | 6.0.3 | 99788 / 88950 | 0.22 s / 0.24 s | 186 / 160 MiB |
| GitHub | Scoped | 7.0.2 | 99789 / 88267 | 0.045 s / 0.049 s | 84 / 83 MiB |
| Stripe | Full | 6.0.3 | 479755 / 254667 | 0.97 s / 0.82 s | 240 / 185 MiB |
| Stripe | Full | 7.0.2 | 479756 / 260230 | 0.332 s / 0.238 s | 105 / 82 MiB |
| Stripe | Scoped | 6.0.3 | 147866 / 234823 | 0.59 s / 0.56 s | 183 / 155 MiB |
| Stripe | Scoped | 7.0.2 | 147867 / 240068 | 0.128 s / 0.140 s | 71 / 74 MiB |

200 called operations with TS 7.0.2:

| Document | Paths type | Instantiations (chain / fetch) | Check time (chain / fetch) | Memory (chain / fetch) |
| --- | --- | --: | --: | --: |
| GitHub | Full | 1495402 / 326522 | 0.807 s / 1.763 s | 192 / 124 MiB |
| GitHub | Scoped | 543983 / 289054 | 0.429 s / 0.529 s | 117 / 108 MiB |
| Stripe | Full | 1043753 / 428838 | 0.896 s / 0.811 s | 124 / 101 MiB |
| Stripe | Scoped | 751243 / 422528 | 0.698 s / 0.688 s | 102 / 98 MiB |

On these documents openapi-chain has a larger fixed cost: with the full generated `paths` and 40 calls it checks about 1.4× slower on TS 7 (1.2-1.3× on TS 6) and uses more memory. How the cost grows with calls depends on the document. On GitHub, going from 40 to 200 calls raised openapi-fetch's check time fivefold and made it 2.2× slower than openapi-chain. On Stripe, openapi-fetch grew 3.4× against openapi-chain's 2.7× and remained slightly faster. Scoping to the called paths removes most of openapi-chain's fixed cost: with 40 calls, scoped consumers check within about 10% of each other on both compilers, and with 200 GitHub calls the scoped openapi-chain consumer is 1.2× faster. A single process timing is not editor latency, and your operations may differ from this sample; measure your own schema before relying on a ratio.

### Relation to openapi-fetch's published table

openapi-fetch's README lists sizes and GET throughput from its `test/bench/index.bench.js`. Reproducing that harness on 2026-09-29 with the versions above showed these differences, which is why this suite validates every call and separates the mock and HTTP scenarios:

- axios's default Node adapter and superagent use `node:http`, not the stubbed global `fetch`, so the harness attempts real DNS and TLS connections to `api.test.local`. Here axios uses its fetch adapter in the mock suite, and both use a local server in the HTTP suite.
- The harness's openapi-typescript-codegen fixture is the generator bundle rather than generated client code, so its benchmarked call throws. Generated clients depend on each schema and are omitted here.
- feature-fetch 0.1.x takes `baseUrl` rather than the harness's `prefixUrl`, and returns failures as `[false, error]` tuples instead of rejecting.

The absolute throughput depends on the machine; compare ratios within one run.

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

The September 26 core structured-value guard adds 107 B over the preceding 3060 B build: **3167 B transitive gzip**. The September 29 request-overhead work (base URL reuse and direct header-record merging) measures **3306 B**. Adding the openapi-fetch adapter entry changed shared chunk boundaries without changing core code: **3335 B** across four emitted modules. The 3584 B budget retains space for maintenance and correctness fixes. Budget changes require an explained measurement and review; strict/compiler code remains outside this entry.
