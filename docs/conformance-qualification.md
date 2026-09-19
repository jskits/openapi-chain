# Conformance follow-up qualification

Implementation snapshot: `6367587`, following the prior `a39ea6f` review.
Verified locally on 2026-09-20 (Asia/Shanghai), macOS arm64, Node 24.16.0,
pnpm 10.34.5. The documentation/release-note commit follows this snapshot.

## Independent matters

| Commit    | Matter                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| `46b607a` | Preserve significant slashes; require the typed template escape for non-representable chains |
| `6eb86a7` | Infer composed multipart defaults without assuming allOf means object                        |
| `259f552` | Ignore Paths specification extensions and reject invalid path keys                           |
| `4a6cce9` | Decode local reference fragments in URI-then-JSON-Pointer order                              |
| `9cd795f` | Add independent normative fixtures, generated types and actual HTTP wire checks              |
| `6367587` | Test installed tarball consumers with generated types and actual HTTP                        |

## Local evidence

- Full `pnpm check` passed; the expanded installed-consumer check also passed.
- 254 tests across 21 files. Coverage: statements 95.39%, branches 93.65%,
  functions 97.05%, lines 96.55%. All 90% gates remain enabled.
- Generated fixture freshness and positive/negative TypeScript consumers passed.
- Build, publint, attw, ESM/CJS consumers and generated NodeNext consumers passed.
- Chromium integration passed: both built clients, multipart, Unicode,
  credentialed CORS, cookie omission, AbortSignal and streaming extensions.
- Core transitive gzip remains 1959 / 2048 B. Comparable single-file gzip:
  core 1850 B, strict 6495 B, metadata 4136 B, pinned openapi-fetch 2833 B.
- 5000-route type fixture: 1888299 instantiations, 874820 KB memory, 2.49 s check.
  Runtime and size methodology remains in [performance](performance.md).

The new corpus uses literal normative expectations and server-observed requests,
not output from a second invocation of the implementation under test. Its source
references and limits are in [the fixture guide](../test/fixtures/README.md).
Generated `string & unknown` has one scoped lint-rule exemption; generated-file
freshness and type checks remain enabled.

## Remote and publication evidence

Read-only GitHub REST and npm registry checks on the same date established:

- [Remote main](https://github.com/jskits/openapi-chain/tree/127d7faca9a4c71b8449e6f6f82173c064c3de9e)
  is `127d7fa`, preceding the client migration and these fixes.
- The newest returned [CI workflow run](https://github.com/jskits/openapi-chain/actions/runs/35429804994)
  failed on an older PR SHA `103713d`; it does not qualify the local implementation.
  Recent Dependabot workflow results likewise are not current implementation CI.
- The public registry's latest `openapi-chain` is `0.0.1`. Its downloaded tarball
  contains only `package/package.json`; it has no current runtime or declarations.
  Installing that published version cannot validate this implementation.
- The isolated local consumer installs the freshly packed local artifact and
  verifies its behavior. It is not evidence of npm publication or third-party adoption.

No push, release dispatch or publication was performed. Qualification of the
current SHA on remote OS/Node jobs remains pending a push. Published-consumer
qualification additionally requires the version/release flow and registry-visible
artifacts. Firefox/WebKit and independent production applications remain unverified.

## Behavior boundaries

Use `$path()` for significant trailing/repeated leading slashes. The core has no
schema at runtime and therefore cannot recover a trailing slash from a property
chain. Strict chain indexing follows the same representability boundary.

The compiler infers serialization metadata; it is not a full schema validator.
Ambiguous inferred allOf media defaults fail explicitly. External references and
local named anchors still require preprocessing; local JSON Pointer references
support URI fragment decoding. The supported subset and extension boundaries
remain in [support](support.md); this corpus is not a complete OpenAPI certification.
