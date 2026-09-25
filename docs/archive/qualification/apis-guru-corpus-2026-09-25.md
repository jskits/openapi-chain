# APIs.guru OpenAPI corpus (2026-09-25)

Baseline: [`1c3cb7d`](https://github.com/jskits/openapi-chain/commit/1c3cb7d), which includes the fixes listed below and the `pnpm test:corpus` script used for the results. This is a dated observation of third-party descriptions, not a compatibility promise for any listed API.

The corpus is the preferred version of every API that [APIs.guru](https://apis.guru) lists with an OpenAPI 3.x description: 1,521 documents (1,485 OpenAPI 3.0.x, 36 OpenAPI 3.1.x), 605 MB of JSON. Swagger 2.0 descriptions, 2,192 of the directory's 3,992 versions, are outside the supported input. The API list had SHA-256 `dfac835d2d1f13dfdb82723d72be1acf567df53c1b710bf6d68e28b795696e66`; the source directory was last updated on 2026-04-20. The documents are not copied into this repository. The environment was macOS arm64, Node 24.16.0, TypeScript 6.0.3 and 7.0.2.

## Reproduction

```sh
pnpm build
pnpm test:corpus --types=120
```

The first run downloads the documents into `.cache/corpus`; `--offline` reuses them. Results and every rejected operation are written to `.cache/corpus/results.json`. To compare a release, rerun with `--dist` pointing at that build's `dist` directory.

For every document, the check compiles metadata. When compilation fails only because of a repeated template hierarchy, it retries with the documented `onAmbiguousTemplate: 'allow'` option. It then sends every operation through the strict and core clients twice: once with required inputs only, and once with every declared parameter. Values are derived from each document's schemas; binary multipart fields are files, and bodies are sent when required or for POST, PUT and PATCH. A capturing transport records each request; nothing reaches the network. Outcomes are classified as sent, contract rejection (`OpenAPIChainError`), platform error, crash, or suspicious wire output (an unrendered placeholder, `[object Object]`, or a bare `undefined`/`NaN` value).

The types pass takes the 10 largest documents and the first 110 others by SHA-256, generates each with the CLI and type-checks typed strict and core calls for up to 60 operations through `$path()` and `OperationInputFor`, under `strict` and `exactOptionalPropertyTypes`.

## Results

| Check | Result |
| --- | --- |
| Crashes, hangs, non-contract exceptions | 0 across 102,156 operations, 2 clients and 2 input variants |
| Metadata compilation | 1,465 (96.3%) by default; 44 more with `onAmbiguousTemplate: 'allow'`; 12 (0.8%) invalid documents |
| Compile time | p50 0.1 ms, p99 5.8 ms, max 131 ms (Microsoft Graph beta, 14,227 path keys) |
| Strict requests, required inputs | 91,309 of 100,590 sent (90.8%); 99.8% excluding path keys with `#` or `?` |
| Core requests, required inputs | 91,602 of 102,156 sent (89.7%); 98.4% excluding path keys with `#` or `?` |
| Suspicious wire output | Strict 0; core 4 operations (object path parameter, below) |
| CLI generation (120 documents) | 112 generated; 6 repeated template hierarchies, 2 invalid documents |
| Typed consumers | 112 of 112 passed; 5,444 typed calls |
| Type instantiations | p50 88,205, p90 308,446, max 9,734,083 (Graph beta, unscoped) |

The 12 documents that do not compile violate OpenAPI: six media type keys are not media types (`form-data`, `applicationjson;version=2018-01-01`, `text/plain; utf-8`, `codecs=opus`, `examples` and an empty key), four path keys embed a query string whose template names have no parameter definitions, and two parameters have empty names. Each error names its operation.

Remaining rejections of required-input requests are documented fail-closed behavior:

- 242 documents, almost all converted AWS descriptions, append `#marker` to path keys to distinguish operations, and a few embed `?` query strings. Fetch would drop the fragment or start a query, so 9,057 operations fail before transport. The [troubleshooting guide](../../troubleshooting.md#a-path-or-charset-is-rejected) describes rewriting them.
- Stripe describes arrays and nested objects with `deepObject`, whose representation OpenAPI leaves undefined; 152 strict form operations need a body extension. Nested query, path, form and multipart values in 7 documents, including Stripe, are rejected for the same reason.
- Multiple Encoding `contentType` choices, a `*/*` Parameter `content`, and a few binary fields that the sampler supplied as text require application serialization.
- Core requires a body extension for structured form bodies in 161 documents. It sent `[object Object]` for Jellyfin's object-typed `version` path parameter, the schema-free coercion described in the [support boundaries](../../support.md#choosing-core-and-migrating-to-strict); strict serializes that parameter from metadata.

## Defects found and fixed

| Commit | Found in | Defect |
| --- | --- | --- |
| [`ca12304`](https://github.com/jskits/openapi-chain/commit/ca12304) | SoundCloud | `style: deepObject` compiled only with an explicit `explode: true`, although OpenAPI 3.2 states that `explode` has no effect on it and defaults to `false`. |
| [`8893601`](https://github.com/jskits/openapi-chain/commit/8893601) | PeerTube | Encoding keys naming properties declared in `oneOf` alternatives failed compilation of the whole document. |
| [`ec50684`](https://github.com/jskits/openapi-chain/commit/ec50684) | Open Policy Agent | `allowReserved` on an OpenAPI 3.0 path parameter, where it does not apply, failed compilation instead of having no effect. |
| [`8ec4c1b`](https://github.com/jskits/openapi-chain/commit/8ec4c1b) | Stripe, xkcd | Forwarding an `OperationInputFor` value failed type checking for operations with an optional request body, released in 0.5.1 (106 errors for Stripe), and before release also for operations without a body (xkcd). |

The corpus also exercised [`ad06b6f`](https://github.com/jskits/openapi-chain/commit/ad06b6f): with 0.5.1, strict sent Jellyfin's `DELETE /Plugins/{pluginId}/{version}` to `/Plugins/x1/` when the object-valued version rendered empty; it now fails before transport. On the same corpus, 0.5.0 and 0.5.1 compiled 1,462 documents by default and this baseline 1,465; every other outcome difference was a message change or one of these fixes.

## Large descriptions

Microsoft Graph beta (74 MB of JSON, 14,227 path keys) typed as a whole client exceeds the repository's 3,000,000-instantiation type-scale budget. Scoping the CLI output to the 35 paths its consumer called brings it well below:

| Graph beta consumer | TypeScript 6.0.3 | TypeScript 7.0.2 |
| --- | --- | --- |
| All paths | 9,734,083 instantiations, 2,739 MB, 13.1 s | 9,764,503 instantiations, 1,381 MB, 6.0 s |
| 35 selected paths | 195,960 instantiations, 952 MB, 2.0 s | 197,996 instantiations, 530 MB, 0.6 s |

Scoping reduced `metadata.ts` from 12.4 MB to 30 KB; `schema.d.ts` stayed 48 MB because the CLI still declares the whole source document, as described for [large schemas](../../large-schemas.md).

## Limits

Values come from schemas, not from real API usage, so a sent request shows that the client can represent the operation, not that the server accepts it. Responses were not parsed; each capturing transport returned 204. The types pass covers 120 documents and at most 60 operations each. APIs.guru descriptions are curated copies that may differ from each vendor's current description. The results do not establish editor responsiveness, browser behavior, or production adoption.
