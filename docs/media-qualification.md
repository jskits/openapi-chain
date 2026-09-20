# Media and charset qualification

Implementation snapshot: `183abef`, following review of `53a47ad`.
Local verification: 2026-09-20, macOS arm64, Node 24.16.0, pnpm 10.34.5.

| Commit    | Matter                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| `5312f8d` | Classify response media independently of parameters                                  |
| `7f30f00` | Enforce UTF-8 for generated text; preserve pre-encoded bytes and extension ownership |
| `183abef` | Verify parser and charset contracts in installed HTTP consumers and Chromium         |

`pnpm check` passed: 337 tests in 30 files, generated fixtures, typed lint,
TypeScript, build, publint, attw, installed ESM/CJS/NodeNext consumers, real HTTP,
core size and type-scale budgets. Coverage: statements 96.30%, branches 94.41%,
functions 98.57%, lines 97.13%. Core transitive gzip is 2041 / 2048 bytes; the
budget and measurement method were not changed.

Chromium verified misleading response media parameters, UTF-8 request bytes and
unsupported charset rejection in both clients, alongside multipart, filenames,
CORS, cookie policy, cancellation, streaming and binary slice checks.

A temporary copy with pending Changesets generated version `0.1.0`, updated its
lockfile, built all entries and passed the installed-package consumer checks.
This rehearsal reused local development dependencies and did not publish npm or
consume the working repository's Changesets.

Core request construction now shares header merging and body-header assignment,
and relies on the standard Fetch body classes in the supported runtimes. This
keeps the new charset checks within the existing size limit. Default response
text decoding remains UTF-8; non-UTF-8 responses require a response extension.
See the [media and encoding contract](support.md#media-recognition-and-text-encodings).

This report records local evidence. Remote CI results must be checked against the
exact pushed SHA; npm registry delivery and provenance require a separate release.
