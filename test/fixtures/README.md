# Independent conformance corpus

`conformance.openapi.json` is an original, complete OpenAPI document used by the
pinned generator, TypeScript consumers, metadata compiler and a real local HTTP
server. It is not generated from client implementation or expected metadata.

Normative sources and manually specified expectations:

- [OAS Paths Object](https://spec.openapis.org/oas/v3.1.1.html#paths-object):
  specification extensions are not routes; paths retain their slash structure.
- [OAS parameter style examples](https://spec.openapis.org/oas/v3.1.1.html#style-examples):
  non-exploded form array `color=blue,black,brown`.
- [OAS Encoding Object](https://spec.openapis.org/oas/v3.1.1.html#encoding-object):
  a string without contentEncoding defaults to text/plain, including when it has
  additional allOf constraints. Native FormData must preserve it as a text field.
- [RFC 6901 section 6](https://www.rfc-editor.org/rfc/rfc6901.html#section-6):
  URI fragment decoding precedes JSON Pointer token decoding; see the separate
  reference-fragments regression cases for encoded separators and malformed input.

`conformance.test.ts` compares actual server-observed paths and request bodies
against literal expectations. Chain/template equivalence is checked only for
chain-representable paths. Trailing-slash paths use the typed template API.
The compatible document subset is also exercised as OAS 3.0 and 3.2.
`conformance.typecheck.ts` verifies generated positive and negative consumer cases.

Regenerate with `pnpm generate:example && pnpm format`. `pnpm test:generated`
checks fixture freshness. These cases extend qualification; they are not a full
OpenAPI conformance certification or a substitute for real application schemas.

The pinned generator emits `string & unknown` for constraint-only allOf. Only the
redundant-type-constituents lint rule is disabled for this generated declaration;
typechecking and byte-for-byte generator freshness checks remain enabled.

`schema-properties.test.ts` asserts invariant native multipart output for 180
combinations of scalar/array/object values, inline/referenced schemas, composition
order, repeated references and broader media declarations across OAS 3.0/3.1/3.2.
Expected text/file parts are literal fixtures, independent of the metadata compiler.
`schema-work.test.ts` bounds observed expansion work without timing thresholds;
`pnpm benchmark:metadata` reports shared-DAG compilation times separately.
