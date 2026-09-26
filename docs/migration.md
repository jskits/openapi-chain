# Migrating from core to strict

[Documentation index](README.md) · [Offline migration checks](migration-check.md) · [Support matrix](support.md)

Core and strict share the fluent API, generated path types, operation extensions, transport interface and HTTP result model. That makes most call sites reusable. Switching entry points is not a guarantee of identical requests or parsed values: strict applies metadata that core never had.

Choose core when the operations you use have verified default encodings and suitable response parsing. Choose scoped strict when you depend on declared serialization rules or have not established that core matches an external API. Do not wait for core to throw: an incorrectly encoded filter can receive HTTP 200 with the wrong data. A percentage of documents lacking selected keywords is not a measurement of compatible users.

## What stays and what changes

| Surface | Migration action |
| --- | --- |
| Fluent methods, `$path`, `baseUrl`, static headers, Fetch/transport, `throwOnError` | Keep the existing configuration and call forms; add matching compiled metadata |
| Explicit `contentType` and operation extensions | Keep them initially; strict may infer a single concrete media, but removing explicit media is optional |
| Empty query records | Both clients now invoke a configured query extension for `{}`; omitted input skips it. Earlier strict versions skipped empty records |
| Parameters and paths | Review style, explode, content, reserved characters and value shapes; core rejects object path/header/cookie values and nested query/array values without a location extension |
| Missing/extra inputs | Fix missing required values and undeclared keys, including undeclared keys whose value is `undefined`; strict rejects them before extensions. Declared required header parameters must be supplied in `header`, even if similarly named client/init headers exist |
| Nullish values | Core drops nullish query/header/cookie values; strict skips `undefined` but generally serializes `null`. Use omission/`undefined` when absence is intended; required inputs must still be supplied |
| Request bodies | Strict checks declared media and required body presence, and rejects `contentType` without a body. Plain form objects may become usable without a body extension; keep tested extensions until separately reviewed |
| JSON/text responses | Defaults generally agree when the server sends accurate media types; extensions own parsing when supplied |
| Binary, vendor media or no Content-Type | Strict defaults to ArrayBuffer where core used text. Adapt the consumer or install an operation response extension before switching |
| Compilation and routing | Bundle supported references, scope large documents, and use exact `$path()` for non-fluent paths or ambiguous chains |

Strict still does not validate full JSON Schema constraints or response data. Unsupported encodings, incorrect documents and browser restrictions need the remedies in the [support matrix](support.md). Runtime extensions cannot recover a failed compilation or bypass earlier required/undeclared input checks.

Core now fails before transport when its default serializer would coerce a structured value into `[object Object]` or flatten a nested array. If you used such a value, add a location extension that owns its wire format or move the operation to strict metadata serialization. Flat arrays and flat query objects retain their existing schema-free behavior, which still needs a wire-level comparison with your API.

## 1. Scope the contract before changing clients

Keep one schema revision for generated types and metadata. Use the same selected paths for `Pick<paths, ...>` and `compileOpenAPIMetadata(document, { paths })`; the [runnable scoped example](large-schemas.md) keeps these selections together and compiles metadata at build time. Do not prune the source document before resolving references.

If a third-party document repeats a template hierarchy and cannot be corrected, explicitly opt into `onAmbiguousTemplate: 'allow'` and use exact `$path()` when methods do not disambiguate the chain. This does not allow missing routes or relax request validation.

## 2. Establish response behavior while still on core

For endpoints that are actually binary, configure generated response types to match ArrayBuffer and use an explicit `response.arrayBuffer()` extension in core first. Then move to strict, verify the consumer, and remove the extension only if the strict default is the intended contract. Type assertions alone do not turn a runtime string into bytes.

For a legacy endpoint intentionally consumed as text despite an opaque or missing media type, retain a text extension on that operation:

```ts
const textResponse = {
  response: async (response: Response) => {
    const status = response.status;
    if (status !== 200 && status !== 404) {
      throw new TypeError(`Unexpected status ${status}`);
    }
    return { status, data: await response.text() };
  },
};
```

This example assumes declared 200 and 404 responses both contain strings. In your application, check it with `satisfies OperationExtensionsFor<paths, '/your-path', 'get'>`, include every supported status with its corresponding data shape, and pass it as `extensions: textResponse`. Empty/no-content statuses need their declared `undefined` result. A response extension replaces parsing for both success and error responses and must return the actual status. See the [typechecked regression example](../test/migration-contract.test.ts) and the [binary parsing example](../test/response-contract.test.ts).

This preserves an intentional legacy consumer contract without changing strict's binary default or weakening request serialization. Do not apply a text parser globally to JSON or binary endpoints.

## 3. Compare representative calls offline

Run the [migration comparator](migration-check.md) with independent, fresh inputs and responses for both clients. Include null/empty values, reserved characters, arrays/objects, extension callbacks, error statuses and binary bodies. Review exact wire differences against the server contract: repeated keys versus comma-delimited values can be a necessary correction, whereas `%20` versus `+` may be equivalent for your server.

Keep each verified correction as an assertion against an independent expected request. Matching core is not the correctness oracle. A scoped comparison also says nothing about operations you did not exercise.

Use real local/server integration tests for authentication, signatures, custom transport, browser credentials/CORS, streaming and fluent ambiguity. Do not shadow real POST/PATCH/DELETE requests to both clients; the offline comparator substitutes a recording transport precisely to avoid duplicate writes.

## 4. Switch at the application client boundary

Change the import/factory to `createStrictClient` and supply compiled metadata. Preserve `baseUrl`, headers, transport, explicit media and adapters initially. Separate clients may coexist for explicitly selected endpoint groups during rollout; make that selection before issuing a request.

Do not catch every strict error and automatically retry through core. That would hide contract failures and can repeat requests that already reached the server. Resolve validation failures at their source. Use location/body extensions only when you own the vendor wire format, and keep strict's input checks intact.

After the selected operations pass type checking and independent integration checks, migrate the next scope. Remove transitional response/body adapters only as separate, tested changes. TS 7 improves type-checking performance; it does not prove runtime serialization compatibility.

## Qualification

The repository tests generated call-site compatibility with complete metadata, intentional nondefault query changes, legacy response adapters, null/undefined boundaries, and extension invocation in Node and Chromium. The offline comparator is also tested for errors, multipart and binary values. These checks support the migration workflow; they do not establish universal core compatibility or complete OpenAPI support.
