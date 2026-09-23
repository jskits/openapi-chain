# Runtime hardening qualification — 2026-09-24

This is a historical verification record, not a claim about a published npm version. The reviewed baseline was `7d3168b`; the verified implementation and installed-consumer fixtures end at `55bf5f4b0236467c0491af5f8c8014436b26dd87`. The final documentation commit only records these results and reconciles the size description. No push, remote CI run, npm publication, or release was performed for this remediation.

## Findings and focused commits

| Finding | Commit | Result |
| --- | --- | --- |
| URL normalization escapes the service path | `d9ed95c` | Encoded-segment contract, delimiter/control rejection, early path validation and parsed URL boundary checks |
| Missing or partial strict metadata | `9680d64` | Construction requires a complete version 1 artifact with valid route/method envelopes |
| Structural failures invoke extensions first | `33965b6` | Query conflicts, malformed parameter containers, undeclared bodies and explicit media errors fail before callbacks |
| Staged formatting rejects ignored release files | `d270271` | Exclude ignored release documents before invoking the formatter |
| Exported HTTP method array is mutable | `f1f27fd` | Freeze the shared runtime tuple |
| Form inference rejects recursive JSON schemas | `92ec60f` | Infer only form-capable media; wildcard JSON remains usable while unsupported form inference fails closed |
| Malformed versions and pre-3.2 QUERY | `ebd1cd5` | Require major.minor.patch syntax and enforce QUERY availability |
| Cookie-style explode default | `dbdb40e` | Default OpenAPI 3.2 cookie style to exploded serialization |
| Invalid serialization-critical document fields | `7ea3bf7` | Reject nonboolean required, missing content, malformed media entries and invalid Encoding header maps |
| Case-sensitive header type overrides | `02cdfc1` | Match runtime header override semantics without changing query case sensitivity |
| JSON.stringify produces no JSON | `3764aab` | Shared guard for bodies, parameters and form parts, with preserved causes |
| Non-record values silently disappear | `70f1f18` | Reject Date, Map, Set, Blob and class instances in structured record positions |
| Encoding style/contentType precedence | `9f7a094` | Ignore contentType when explicit RFC6570 fields select style-based encoding |
| Nested Encoding capability propagation | `bc67da9` | Fail closed for applicable nested multipart/form encoding; ignore inapplicable JSON annotations |
| Core/strict URL and query drift | `5a35322` | Share joining, base slash normalization and query suffix handling |
| Core accepts response extensions without data | `d7a9822` | Share status/data contract validation |
| Caller mutations change existing strict clients | `8e67721` | Deep-clone and freeze runtime metadata, including JSON-decoded artifacts |
| Cross-realm native body detection | `f78e5e6` | Platform brand checks; Chromium iframe coverage for Blob, FormData, URLSearchParams and ArrayBuffer |
| Media parameters collapse distinct declarations | `612c964` | Preserve parameter constraints, rank specificity and reject ambiguous matches |
| Literal wildcard request media accepted by types | `c2b4958` | Check concrete media at operation-call boundaries on TS6 and TS7 |
| Unstable contract diagnostics | `753256c` | TypeError-compatible stable codes, operation context and JSON causes |
| Safety budget and public contract drift | `2ad01f1` | Document the complete runtime contract and 3 KiB gate |
| Core accepts wildcard media through body extensions | `0d2e828` | Reject wildcard Content-Type before body extensions |
| Installed-package qualification of new contracts | `55bf5f4` | Exercise errors and media at runtime, and header/media type checks through installed declarations |

## Verification

Environment: Node.js 24.16.0, pnpm 10.34.5, macOS arm64, TypeScript 6.0.3 and 7.0.2.

- `pnpm check`: passed, including build, formatting, lint, generated-source checks, coverage, CLI, migration, scoped artifacts, installed root/CLI/query consumers, size and type-performance gates.
- Vitest: **533 tests passed**; CLI: **19 tests passed**.
- Coverage: statements **96.52%**, branches **94.40%**, functions **98.31%**, lines **97.15%**.
- Installed root package: ESM and CommonJS, NodeNext declarations under both compilers, and real HTTP.
- Installed CLI: npm bin, generation/check, scoped generated consumer, browser module isolation and real HTTP.
- Installed query adapter: independent ESM/CommonJS, TanStack Query and SWR types, HTTP/cache/errors and browser bundle.
- `pnpm test:browser`: Chromium passed, including the iframe native-body probe and unreadable status-zero responses. It must run after the build completes; an overlapping rebuild temporarily removed a served module during one attempt, and the subsequent run passed.
- Core transitive gzip: **3020 B / 3072 B**. The intermediate 2560 B budget was insufficient for the complete set of safety checks and shared contracts. Historical 2 KiB measurements remain historical.
- TS6 and TS7 type-performance scenarios remained within their existing 3,000,000-instantiation and 1,200,000-KB limits, including 5000-route core/strict and scoped cases.

## Deliberate boundaries

Applicable nested multipart and URL-encoded encodings require a whole-body extension; this work prevents silent replacement formats rather than claiming full nested-encoding implementation. JSON annotations outside their specified applicability do not block requests.

Strict construction validates the metadata envelope and takes an immutable snapshot. It is not a general OpenAPI or JSON Schema validator. The compiler remains responsible for runtime serialization metadata; the changes do not introduce a broad compiler rewrite.

A runtime schema hash cannot prove that erased TypeScript types came from the same source. Existing CLI generation, artifact provenance and `--check` remain the build-time consistency mechanism. No decorative runtime hash guarantee was added.

Literal wildcard request media are rejected at typed operation calls. Broad string/template types and JavaScript callers still rely on runtime validation; `OperationInputFor` describes an input shape rather than proving concrete media.
