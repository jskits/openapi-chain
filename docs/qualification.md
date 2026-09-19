# Hardening qualification

Implementation snapshot: `98c9387`. This report and release-note commit follows the
18 independent implementation, contract, test and documentation commits below.
All results are local, on macOS arm64 / Node 24.16.0 / pnpm 10.34.5.

## Verified

- Frozen-lockfile installation completed successfully.
- `pnpm check` passed: formatting, typed lint, real generator fixture comparison,
  strict TypeScript, runtime/local HTTP tests, coverage, build, publint, attw,
  installed tarball consumers, core size and TypeScript scale budgets.
- 210 Vitest tests passed. Coverage: statements 95.20%, branches 93.43%,
  functions 97.01%, lines 96.28%; all original 90% gates remain enabled.
- `pnpm test:browser` passed in Chromium: both built clients, multipart boundaries,
  Unicode, credentialed CORS, cookie omission, AbortSignal and streamed extensions.
- Core release size metric: 1959 / 2048 bytes transitive gzip.
- 5000-route / 25-operation TypeScript fixture: 1873299 instantiations,
  898458 KB compiler memory, 2.53 seconds check time on this run.
- The 10000-route strict-chain microbenchmark was about 1.65 microseconds/request;
  see [methodology and limits](performance.md), not a real-network speed claim.
- Comparable single-file gzip: core 1850 B, strict 6475 B, metadata 3867 B,
  openapi-fetch 0.17.0 2833 B. These are different feature sets.

## Independent commits

| Commit    | Matter                                                                  |
| --------- | ----------------------------------------------------------------------- |
| `545fc6d` | fix(types): support current OpenAPI generator parameter records         |
| `fba7785` | fix(serialization): preserve Unicode in reserved expansion              |
| `c8d632c` | fix(core): clear inherited content type for FormData                    |
| `e882af6` | fix(metadata): bound recursive schema inference                         |
| `4d724a1` | fix(metadata): preserve own keys in serialization dictionaries          |
| `39e1f24` | fix(paths): reject Fetch-normalized dot segments                        |
| `7c9f731` | docs(api): define request extension execution boundaries                |
| `e5e2d6d` | docs(errors): distinguish HTTP results from rejected requests           |
| `ff8620e` | docs(responses): specify parser and binary response contracts           |
| `43f1464` | docs(strict): define metadata trust and validation scope                |
| `744bbaa` | perf(strict): index operation routes at client creation                 |
| `4a83bfe` | test(http): verify native Fetch requests against a local server         |
| `7aafbd1` | test(browser): qualify Chromium Fetch behavior in CI                    |
| `59febb0` | test(serialization): add deterministic adversarial URL corpus           |
| `014eade` | test(performance): qualify schema scale and comparable bundle costs     |
| `744084b` | refactor(runtime): separate strict serialization and clarify core state |
| `e012444` | docs(security): provide an actionable private reporting channel         |
| `98c9387` | docs(onboarding): add a generated and executable client guide           |

## Deliberate boundaries

HTTP status mode, response parsing, strict validation and request extension order
are now explicitly documented and regression-tested. This does not add a complete
JSON Schema validator or make transport/parse failures become HTTP result unions.
Recursive serialization inference that cannot determine a wire representation is
rejected with a controlled error; ordinary JSON object recursion remains supported.

No push, npm publication, remote CI execution, GitHub release configuration change
or private-reporting setting change was performed. Firefox/WebKit and remote OS
matrix results are not established by the local Chromium/Node results. See the
[support matrix](support.md), [onboarding guide](getting-started.md) and
[security reporting process](../SECURITY.md).
