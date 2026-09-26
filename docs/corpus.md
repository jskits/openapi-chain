# Corpus regression checks

The five small OpenAPI documents in [`test/fixtures/corpus-regressions`](../test/fixtures/corpus-regressions) are original, synthetic reconstructions of failure shapes discovered by the [APIs.guru qualification run](archive/qualification/apis-guru-corpus-2026-09-25.md). They contain no vendor paths, descriptions, examples or schema text copied from those documents. The fixture set is part of this repository under its MIT license; the upstream APIs' licenses do not apply to these new documents.

The qualification run used the preferred OpenAPI 3.x version listed by APIs.guru on 2026-09-25 (list SHA-256 `dfac835d2d1f13dfdb82723d72be1acf567df53c1b710bf6d68e28b795696e66`). It did not retain each vendor's API version in the report. Each synthetic fixture is version `1.0.0`; its OpenAPI specification version is recorded in the document.

| Fixture | Historical source of the failure shape | What the fixed check covers |
| --- | --- | --- |
| `soundcloud.openapi.json` | SoundCloud, `ca12304` | `deepObject` without `explode`; fluent and exact query wire plus parsed JSON response |
| `peertube.openapi.json` | PeerTube, `8893601` | Multipart encoding property declared inside a `oneOf` branch; part media and filename |
| `opa.openapi.json` | Open Policy Agent, `ec50684` | OpenAPI 3.0 path `allowReserved` where it has no effect, alongside applicable query `allowReserved` |
| `jellyfin.openapi.json` | Jellyfin, `ad06b6f` | Object path value that renders an empty segment must fail before transport |
| `forwarding.openapi.json` | Stripe and xkcd, `8ec4c1b` | Generated `OperationInputFor` values for optional and absent bodies compile when forwarded to both clients |

`test/corpus-regressions.test.ts` asserts independent literal wire and response expectations for fluent and exact calls. The fixed corpus run additionally compiles all five documents, exercises every operation through strict and core clients, and generates and typechecks consumers. Core's deliberate structured-body and structured-path rejections, and strict's empty path rejection, are explicitly recorded in `baseline.json`.

After building, run the fixed qualification without network access:

```sh
pnpm build
pnpm test:corpus:fixed --compiler=ts6
pnpm test:corpus:fixed --compiler=ts7
```

`pnpm check` runs this fixture set under both supported compilers. The full network corpus remains opt-in.

The baseline pins the fixture names and document hashes, compile outcomes, per-client outcome counts, each non-sent operation with its error code and message, and type generation results. Any difference fails. When a deliberate change improves or changes an outcome, first inspect `results.json` in the cache and the actual wire tests. Then run with `--record-baseline=<temporary-file>` in place of `--baseline`, review the diff, and update `baseline.json` intentionally. A baseline is an approval of specific known exceptions, not a blanket allowance for future contract rejections.

For broad discovery, `pnpm test:corpus --types=120` still downloads the changing APIs.guru corpus (about 600 MB on first use). It writes a detailed report and fails on crashes, parse errors, unavailable documents or generated-consumer type errors. To gate a reviewed complete corpus snapshot, pass `--baseline=<reviewed-file>`. The script will then also fail on new compilation failures, contract rejections, suspicious wire output, changed documents or changed type generation results. The full corpus's synthetic inputs and capture transport cannot establish that real servers accept requests or return correctly parsed responses; the fixed literal wire tests and the repository's local HTTP and Chromium checks address those separate boundaries.
