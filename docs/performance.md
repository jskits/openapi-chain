# Performance qualification

Run `pnpm benchmark` to build fresh artifacts and reproduce all measurements.
The pinned reference client is `openapi-fetch` 0.17.0; TypeScript and tsdown use
the versions in `package.json`. The numbers below are an illustrative local run (see [qualification](conformance-qualification.md))
on macOS arm64 / Node 24.16.0, not a cross-platform throughput guarantee.

## Runtime

Each client uses the same Fetch replacement returning an empty HTTP 204 response.
Each case performs 100 warmup requests, then five samples of 1000 requests; the
reported value is the median in microseconds per request. Calls include chain or
path selection on each iteration. There is no network, JSON parsing or server work.

| Routes | Core | Strict chain | Strict `$path()` | openapi-fetch |
| ------ | ---: | -----------: | ---------------: | ------------: |
| 10     | 1.60 |         2.16 |             1.49 |          2.53 |
| 1000   | 1.07 |         1.43 |             1.26 |          2.37 |
| 10000  | 1.20 |         1.62 |             1.25 |          2.16 |

The 10000-route metadata compile took about 10 ms and strict indexing about 14 ms.
This setup cost is paid at client construction. Runtime figures include different
client response wrappers and Request construction choices; they do not establish
which library is faster for real applications. `test/routes.test.ts` guards against
per-request route-table enumeration without relying on noisy timing thresholds.

## Type system

`pnpm benchmark:types` generates 100, 1000 and 5000 routes using modern generator
parameter conventions and calls 25 distinct operations. Each call checks the
response type; negative assertions retain required-query and path constraints.

| Routes | Instantiations | Compiler memory | Check time |
| ------ | -------------: | --------------: | ---------: |
| 100    |          70399 |         ~97 MiB |     0.18 s |
| 1000   |         404299 |        ~140 MiB |     0.58 s |
| 5000   |        1888299 |        ~854 MiB |     2.49 s |

The check runs in `pnpm check` and CI. Each scenario must stay below 3 million
instantiations and 1200000 KB compiler memory. Wall-clock times are reported but
not gated on shared runners. The 5000-route fixture is intentionally demanding;
large applications should evaluate their actual schemas. It does not model all
endpoints being used, complex response unions, or incremental IDE latency.

## Size

`pnpm benchmark:size` bundles each complete public runtime entry separately with
the same tsdown version, ES2022 target, minifier, no source map and gzip level 9.
Dependencies are bundled and each result must be a single file.

| Entry         | Minified bytes | Gzip bytes |
| ------------- | -------------: | ---------: |
| core          |           4221 |       1850 |
| strict        |          20988 |       6495 |
| metadata      |          12804 |       4136 |
| openapi-fetch |           7418 |       2833 |

These entries have different feature sets. Strict is an alternative to core;
metadata compilation can run at build time, so neither entry must necessarily ship
with every application. Consumer tree shaking can also change the result.

The separate `pnpm size:check` release gate uses a different stable metric: it
concatenates reachable emitted core ESM chunks and gzips that text, including their
source-map comments, with a 2048-byte limit. Neither metric equals the sum of
separately compressed HTTP assets; compare like-for-like when publishing results.
