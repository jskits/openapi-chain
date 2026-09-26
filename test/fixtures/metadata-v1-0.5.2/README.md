# Frozen metadata v1 artifact from openapi-chain 0.5.2

`schema.openapi.json` is an original, small OpenAPI 3.0.3 document created for this repository under its MIT license. It covers a templated path, query and header parameters, URL-encoded form fields, and multipart text and binary parts. No third-party API schema was copied.

`metadata.json` was generated once with `compileOpenAPIMetadata()` imported from the separately installed, public `openapi-chain@0.5.2` package at `/tmp/openapi-chain-registry-JTsE8P/node_modules/openapi-chain/dist/metadata.js`. The installed manifest reported version `0.5.2`; the generated object has `version: 1` and `complete: true`. These SHA-256 values identify the exact source and output:

| File | SHA-256 |
| --- | --- |
| Installed `openapi-chain/package.json` | `88af3bbb3d0f5034d214aa884949f034dd1ba06e380bc46ae36eb6c2c4f075dd` |
| Installed `dist/metadata.js` | `f00a645a868bb65ff0b745f81e51c3f82e6f14a60ee7af7af9a3c63edfe24db3` |
| `schema.openapi.json` | `d0b76fafa84e2aaad84c22dcb5ff1c53a7cbb95b41b6eff4a41ffcf77fd1971d` |
| `metadata.json` | `c4cf84c44ea23b0ca2fd61d1bd1c75e40b00bcab62e61bfd55020612d54ab0c0` |

The compatibility test loads `metadata.json` directly and checks its hash before constructing the current strict client. It deliberately never calls the current compiler. This makes the test sensitive to a runtime change that breaks a previously generated artifact. Add a new versioned fixture for a later compiler release; do not silently regenerate this one during tests.

The test uses a small matching TypeScript path type. It checks runtime metadata and wire compatibility, not the declaration output of the older CLI or compatibility with an arbitrary application schema.
