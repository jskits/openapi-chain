# Qualification archive

[Current documentation](../../README.md) · [Performance methodology](../../performance.md)

These historical reports preserve verification results for the baseline linked at the top of each report. Measurements and release observations apply to the recorded environment and date, where available. They do not establish current CI status, registry availability or support for a feature.

Read the [support contract](../../support.md) for maintained behavior. Run the [development checks](../../development.md#choose-the-right-check) for fresh local evidence and verify remote CI against the implementation being released.

## Reports

Listed from the most recent baseline to the earliest. Each report retains one baseline link for traceability; detailed commit history is available through Git.

| Report | Focus |
| --- | --- |
| [GitHub REST consumer probe](github-openapi-consumer-2026-09-24.md) | Pinned external schema, installed client, drift, real HTTP and query cache |
| [Media and charset](media-qualification.md) | Response media recognition and UTF-8 request behavior |
| [Multipart and binary](multipart-qualification.md) | Filenames, part media and byte slices |
| [Paths and references](path-reference-qualification.md) | Path fidelity, shared references and incremental type checks |
| [Schema semantics](schema-semantics-qualification.md) | Composition, media precedence and bounded inference |
| [Conformance](conformance-qualification.md) | Independent wire corpus and release-state observations |
| [Hardening](qualification.md) | Earlier runtime, contract and package-consumer checks |

The hardening report did not record a verification date; its baseline and runtime environment are preserved without assigning a date from later reports. Historical benchmark numbers are observations, not performance guarantees.
