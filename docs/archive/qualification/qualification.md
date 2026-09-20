# Hardening qualification

[Archive index](README.md) · [Current documentation](../../README.md)

Historical baseline: [verified implementation](https://github.com/jskits/openapi-chain/commit/98c9387f45719d8fba9144b853c4c1b35c3d44d6). Results below apply only to this baseline and the recorded environment; they are not a statement of current support or release status.

This is the earlier hardening snapshot. See the [conformance follow-up](conformance-qualification.md) for the subsequent fixes and later local/remote qualification.

All results are local, on macOS arm64 / Node 24.16.0 / pnpm 10.34.5.

## Changes

- Preserve Unicode, FormData content types and dictionary keys; reject paths that Fetch would normalize to a different endpoint.
- Bound recursive metadata inference and index strict routes at client creation. Keep strict serialization separate from the core runtime.
- Support generated parameter records and document HTTP errors, response parsing, metadata validation and extension execution boundaries.
- Add native HTTP, Chromium, adversarial URL and installed-consumer checks, together with schema-scale and comparable bundle measurements.
- Provide an executable generated-schema guide and private security reporting instructions.

## Verified

- Frozen-lockfile installation completed successfully.
- `pnpm check` passed: formatting, typed lint, real generator fixture comparison, strict TypeScript, runtime/local HTTP tests, coverage, build, publint, attw, installed tarball consumers, core size and TypeScript scale budgets.
- 210 Vitest tests passed. Coverage: statements 95.20%, branches 93.43%, functions 97.01%, lines 96.28%; all original 90% gates remain enabled.
- `pnpm test:browser` passed in Chromium: both built clients, multipart boundaries, Unicode, credentialed CORS, cookie omission, AbortSignal and streamed extensions.
- Core release size metric: 1959 / 2048 bytes transitive gzip.
- 5000-route / 25-operation TypeScript fixture: 1873299 instantiations, 898458 KB compiler memory, 2.53 seconds check time on this run.
- The 10000-route strict-chain microbenchmark was about 1.65 microseconds/request; see [methodology and limits](../../performance.md), not a real-network speed claim.
- Comparable single-file gzip: core 1850 B, strict 6475 B, metadata 3867 B, openapi-fetch 0.17.0 2833 B. These are different feature sets.

## Deliberate boundaries

HTTP status mode, response parsing, strict validation and request extension order are now explicitly documented and regression-tested. This does not add a complete JSON Schema validator or make transport/parse failures become HTTP result unions. Recursive serialization inference that cannot determine a wire representation is rejected with a controlled error; ordinary JSON object recursion remains supported.

No push, npm publication, remote CI execution, GitHub release configuration change or private-reporting setting change was performed. Firefox/WebKit and remote OS matrix results are not established by the local Chromium/Node results. See the [support matrix](../../support.md), [onboarding guide](../../getting-started.md) and [security reporting process](../../../SECURITY.md).
