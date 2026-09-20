# Performance and measurement

[Documentation index](README.md) · [Support matrix](support.md)

Run `pnpm benchmark` to build fresh artifacts and reproduce all measurements. The pinned reference client is `openapi-fetch` 0.17.0; TypeScript and tsdown use the versions in `package.json`. The historical samples below were recorded on 2026-09-20, on macOS arm64 with Node 24.16.0. They are not a cross-platform throughput guarantee or measurements of the current working tree.

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

The separate `pnpm size:check` release gate uses a different stable metric: it concatenates reachable emitted core ESM chunks and gzips that text, including their source-map comments, with a 2048-byte limit. Neither metric equals the sum of separately compressed HTTP assets; compare like-for-like when publishing results.

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
