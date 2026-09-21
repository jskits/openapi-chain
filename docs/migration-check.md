# Offline migration checks

[Documentation index](README.md) · [Support matrix](support.md)

The source checkout includes a scenario comparator for core → strict migrations. It records both clients' requests and feeds them fresh mocked responses. It does not contact your API, duplicate writes or prove that either request is correct for your server. It is development tooling, not a published package entry point or a static compatibility analyzer.

## Run a comparison

From this checkout:

```sh
pnpm build
pnpm migration:check ./examples/migration.config.mjs
```

Copy [the configuration](../examples/migration.config.mjs) and replace its document and scenarios with synthetic examples from your application. The default export contains:

- `document`: the parsed OpenAPI document, from the same revision as your generated types.
- `baseUrl`, `headers`, `throwOnError`: optional shared client settings. The default base URL is `https://migration.invalid`.
- `onAmbiguousTemplate`: optional compiler policy, with the same meaning as in the metadata API.
- `scenarios`: a nonempty array with unique `name`, exact `path`, optional `method` (defaults to `get`) and a `response()` factory returning a fresh `Response` for each client.
- Per scenario, optional `params()` and `input()` factories create fresh path parameters and operation inputs. Use factories for mutable bodies and operation extensions. Optional `strictInput()` replaces only the strict input when testing an explicit migration adaptation; the report marks that case as `adaptedInput`.

The configuration is executable local JavaScript. Use trusted fixtures and synthetic credentials; reports contain request headers and bodies. The built-in transport never sends requests, but configuration code and custom extensions execute normally and must themselves avoid external side effects.

The compiler scopes metadata to the exact paths in the scenarios, resolving references against the complete document. These checks exercise `$path()` calls, not fluent ambiguity resolution, application middleware, custom transports, browser Fetch policies or editor types. Test those separately when used.

## Interpret the report

The command prints JSON. Exit code 0 means every supplied scenario completed without a thrown error and produced matching snapshots. Differences or errors return exit code 1. Configuration errors are printed to stderr; comparison reports, including compilation failures, go to stdout. Two identical thrown errors do **not** count as a passing migration. To compare returned HTTP error results, set `throwOnError: false` and provide those statuses explicitly.

Each scenario includes `core`, `strict`, `differences` and `passed`:

| Difference | What to inspect                                                          |
| ---------- | ------------------------------------------------------------------------ |
| `request`  | URL, method, normalized headers, body and other request-init fields      |
| `response` | Parsed value, including text versus bytes                                |
| `error`    | Compilation, input validation, serialization, parsing or HTTP exceptions |

An empty strict request list means execution did not reach the recording transport. A `metadataError` means the selected scope failed compilation; resolve that before interpreting strict request coverage.

URLs and string bodies are compared exactly. Equivalent `%20`/`+` spellings or different query ordering can produce a difference that only needs review. FormData is compared as ordered fields and file bytes/media/names, without generated multipart boundaries. Binary values preserve view offsets and record their runtime representation, so ArrayBuffer versus a typed array is visible. URLSearchParams versus a string is also reported even when their encoded contents match. JSON objects are tagged separately from byte/undefined snapshots. Streams and unsupported object values fail explicitly; use a dedicated integration test for those cases.

A reported difference can be the **desired correction**, such as retaining a deepObject parameter name. Do not force strict to reproduce an incorrect core request merely to turn the report green. Compare the new request against independent server expectations, then retain a regression test for it. Matching snapshots can also share a bug, and passing a few inputs cannot establish compatibility for a whole schema.

Include absent, empty, null, array/object and reserved-character inputs; optional and required bodies; success and error statuses; binary/no-Content-Type responses; and every extension you use. Runtime values and mocked responses matter, so the tool cannot infer coverage from the document alone.

`pnpm test:migration` verifies the comparator after a build and runs in `pnpm check`.
