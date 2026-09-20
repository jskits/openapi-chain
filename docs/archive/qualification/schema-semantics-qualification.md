# Schema semantics qualification

[Archive index](README.md) · [Current documentation](../../README.md)

Historical baseline: [verified implementation](https://github.com/jskits/openapi-chain/commit/cd6d13ff2bfec58ce613aab312c0d79646bf3990). Results below apply only to this baseline and the recorded environment; they are not a statement of current support or release status.

For the subsequent fixes and later local results, see the [path and reference qualification](path-reference-qualification.md).

Local verification: 2026-09-20 (Asia/Shanghai), macOS arm64, Node 24.16.0, pnpm 10.34.5.

## Changes

- Select the most specific declared request media type before optional metadata.
- Cache schema analysis per compilation and bound depth plus traversal work.
- Exclude mixed templates from dynamic chains using generated negative type fixtures.
- Preserve conjunction when allOf branches define the same property.
- Resolve references according to OpenAPI version and object context.
- Assert schema/wire invariants and add shared-DAG compilation benchmarks.

## Verified locally

- `pnpm check` passed: formatting, typed lint, generator freshness, strict types, coverage, build, publint, attw, installed ESM/CJS and generated NodeNext consumers, actual HTTP from the installed package, core size and type-scale budgets.
- 289 tests across 26 files. Coverage: statements 96.00%, branches 94.05%, functions 98.06%, lines 97.01%. All existing 90% gates remain enabled.
- Chromium integration passed: built core/strict ESM, multipart, Unicode, credentialed CORS, cookie omission, cancellation and streaming extensions.
- 180 invariant combinations cover literal expected native multipart parts across primitive/array/object values, inline/referenced schemas, composition order, repeated references and broader media declarations in OAS 3.0/3.1/3.2.
- Generated mixed-template types reject invalid chain calls and preserve typed `$path()` calls. Runtime conformance verifies the mixed-template URL over HTTP.
- Core transitive gzip remains 1959 / 2048 B. Comparable single-file gzip: core 1850 B, strict 6519 B, metadata 4517 B, pinned openapi-fetch 2833 B.
- 5000-route type fixture: 1888300 instantiations, 877510 KB memory, 2.50 s check.

## Compilation complexity

The review's complete 2096-byte document with 20 shared allOf reference layers previously took about 5972 ms on this machine. The new same-shape probe took 0.61 ms; 28 layers took 0.32 ms. These are illustrative individual samples affected by warmup and scheduling, not timing guarantees. See `pnpm benchmark:metadata`.

Regression gates count observed schema reads and exercise a 28-layer shared DAG, cache isolation, cached-depth enforcement and the 1,000,000-step work budget. They do not rely on timing thresholds. Separate analysis caches preserve distinct kind/content/property/encoding results and retain sibling-specific cache identity.

## Semantic boundaries

- Media selection is based on declarations, not only entries with extra rules.
- allOf property constraints are preserved conjunctively; conflicting inferred media defaults fail explicitly. This remains serialization inference, not a complete JSON Schema validator or full support for every applicator.
- Reference Object summary/description annotations have no serialization effect. OAS 3.0 schema references ignore siblings; 3.1/3.2 schema references combine them.
- Path Item reference fields that overlap are rejected because the specification leaves their meaning undefined. Disjoint fields remain supported.
- Local named anchors and external references still require preprocessing. Mixed template paths remain available through `$path()`.

Normative references: [request media precedence](https://spec.openapis.org/oas/v3.1.1.html#request-body-object), [allOf composition](https://spec.openapis.org/oas/v3.1.1.html#composition-and-inheritance-polymorphism), [Reference Objects](https://spec.openapis.org/oas/v3.1.1.html#reference-object), [OAS 3.0 references](https://spec.openapis.org/oas/v3.0.4.html#reference-object), [Path Item references](https://spec.openapis.org/oas/v3.2.1.html#path-item-object).

## Remote qualification

Read-only GitHub REST and npm registry checks on the verification date still show remote main preceding the client migration and npm latest `0.0.1`, neither representing this implementation. No push, release dispatch or publication was performed. Remote CI for this baseline and published-consumer behavior remain unverified, as do Firefox/WebKit and independent production applications. The installed tarball tests prove local package consumption, not publication.
