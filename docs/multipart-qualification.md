# Multipart and binary qualification

Implementation snapshot: `85e8f96`, following review of `916acc9`.
Local verification: 2026-09-20 (Asia/Shanghai), macOS arm64, Node 24.16.0,
pnpm 10.34.5. This report and Changeset follow five focused implementation/test
commits; no remote publication was performed.

| Commit    | Matter                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| `78974dc` | Retain File names when replacing multipart part media types                        |
| `686ef47` | Preserve explicit text media parameters and reject unsupported generated charsets  |
| `efa573a` | Resolve multipart media ranges from concrete Blob/File types                       |
| `c29bf54` | Accept binary views in core without widening their byte ranges                     |
| `85e8f96` | Verify multipart and binary fidelity through installed HTTP consumers and Chromium |

## Verified locally

- `pnpm check` passed: format, typed lint, generated fixtures, TypeScript,
  coverage, build, publint, attw, installed-package consumers and type budgets.
- 319 tests passed across 28 files. Coverage: statements 95.98%, branches 94.05%,
  functions 98.08%, lines 97.05%.
- Core transitive gzip is 1974 / 2048 bytes; the budget was not increased.
- Multipart tests preserve filenames for matching, differing and empty File
  types, retain repeated file parts, reject unsupported text charsets before
  transport, check UTF-8 and pre-encoded non-UTF-8 bytes, select per-file concrete
  types and reject missing/mismatched/wildcard type evidence.
- Core and strict binary tests verify Uint8Array, DataView and Node Buffer slices
  send only the selected bytes.
- Installed-package real HTTP checks inspect part headers, original filenames,
  textual/binary payload bytes and core binary slices from the packed public API.
- Chromium real HTTP checks verify per-file image range selection, filenames,
  explicit UTF-8 part headers, Unicode text and binary slices, alongside existing
  CORS, cookies, cancellation and streaming checks.

## Versioned package rehearsal

A temporary source copy with pending Changesets generated version `0.1.0` and its
changelog, updated the lockfile with lifecycle scripts disabled, built all public
entries and passed `pnpm test:package`. The 31-file `openapi-chain-0.1.0.tgz`
passed installed ESM/CJS, generated NodeNext and real HTTP consumer checks,
including the new multipart assertions. The rehearsal reused local development
dependencies and did not consume the working repository's Changesets.

## Boundaries

See [binary and multipart support](support.md#binary-bodies-and-multipart-parts).
Generated text uses UTF-8; other encodings require pre-encoded bytes or a whole-body
extension. Parameterized text parts use native Blob-backed FormData parts, which
include a filename. Parameterized media ranges and multiple choices require
application serialization. These changes do not add arbitrary MIME generation,
request streaming defaults or complete JSON Schema validation.

Remote Node/OS matrix results, npm OIDC configuration, published provenance and
registry-installed consumers remain unverified for this local commit sequence.
After push/publication authorization, run the existing gated release workflow and
verify those results against the exact published version. Local qualification and
a version rehearsal do not establish public delivery.
