# @openapi-chain/cli

## 0.5.3

### Patch Changes

- Updated dependencies [0792e82]
- Updated dependencies [cd19c0b]
  - openapi-chain@0.6.0

## 0.5.2

### Patch Changes

- Generate runtime metadata with the `openapi-chain` 0.5.2 metadata compiler. For the OpenAPI 3.0 and 3.1 documents the CLI accepts, generation now:
  - accepts `style: deepObject` without an explicit `explode: true`;
  - accepts Encoding keys that name properties declared in `oneOf` or `anyOf` alternatives;
  - ignores `allowReserved` on path, header and cookie parameters, where it does not apply, instead of rejecting the document;
  - keeps JSON available under `*/*` and `application/*` when a property's explicit types conflict, and requires a body extension only for form serialization.
- Generation errors raised inside an operation name the operation and request-body media type, for example `POST /upload: form-data request body: Invalid media declaration: form-data`. The CLI's own generation behavior is otherwise unchanged.
- Regenerate managed output after upgrading. The manifest records the CLI and runtime versions, so `openapi-chain generate --check` reports 0.5.1 output as stale.

### Dependencies

- Depend on `openapi-chain@^0.5.2`.

## 0.5.1

### Patch Changes

- Generate runtime metadata with the `openapi-chain` 0.5.1 metadata compiler. Its fixes cover multipart `contentEncoding` detection under `allOf`, part media inferred from `allOf` array `items`, ignored `Content-Type` part headers, and consistent property kinds and media across equivalent schema spellings. The CLI's own generation behavior is unchanged.
- Regenerate managed output after upgrading. The manifest records the CLI and runtime versions, so `openapi-chain generate --check` reports 0.5.0 output as stale.

### Dependencies

- Depend on `openapi-chain@^0.5.1`.

## 0.5.0

### Package migration

- Rename the CLI package from `openapi-chain-cli` to `@openapi-chain/cli` and align its version with the 0.5.0 release. Install it with `pnpm add -D @openapi-chain/cli`; the `openapi-chain generate` command and configuration filename remain unchanged.
- Generate metadata modules with type-only imports from `openapi-chain/metadata`, using the runtime's existing public package name. Regenerate managed output after upgrading so its imports and tool-version manifest match the installed packages.
- Preserve the existing generated-directory ownership marker so previously managed output can be regenerated without deleting the directory. Generation dependencies, including the pinned TypeScript 5.9.3 compiler, remain confined to the Node-only CLI package.
- Move the package into `packages/cli` and verify its installed command, generated declarations and browser bundle isolation against packed runtime artifacts with TypeScript 6 and 7.

### Dependencies

- Depend on `openapi-chain@^0.5.0` directly.

## 0.2.0

### Minor Changes

- 0acdb05: Add the official openapi-chain command for deterministic build-time generation of TypeScript declarations, scoped types, runtime metadata and a provenance manifest. Support local OpenAPI 3.0/3.1 JSON/YAML, exact path selection and read-only drift checks, with protected output directories and isolated Node tool dependencies.

### Patch Changes

- 75c62b2: Preserve all metadata property names when emitting generated modules, including __proto__, constructor and toString. Generated metadata now decodes JSON rather than interpreting schema-derived keys as JavaScript object-literal syntax, keeping required parameter validation and multipart serialization consistent with direct compilation.
- Updated dependencies [84bd350]
- Updated dependencies [ad814a3]
- Updated dependencies [c2b4958]
- Updated dependencies [dbdb40e]
- Updated dependencies [0d2e828]
- Updated dependencies [9f7a094]
- Updated dependencies [f1f27fd]
- Updated dependencies [a39ea6f]
- Updated dependencies [02cdfc1]
- Updated dependencies [5dc1635]
- Updated dependencies [92ec60f]
- Updated dependencies [3764aab]
- Updated dependencies [9d2553c]
- Updated dependencies [612c964]
- Updated dependencies [7ea3bf7]
- Updated dependencies [8e67721]
- Updated dependencies [ebd1cd5]
- Updated dependencies [53a47ad]
- Updated dependencies [f78e5e6]
- Updated dependencies [bc67da9]
- Updated dependencies [839d30a]
- Updated dependencies [ead04d8]
- Updated dependencies [70f1f18]
- Updated dependencies [33965b6]
- Updated dependencies [d4f3fc0]
- Updated dependencies [38e06f6]
- Updated dependencies [86d9492]
- Updated dependencies [916acc9]
- Updated dependencies [2bce025]
- Updated dependencies [66800e7]
- Updated dependencies [1ee9513]
- Updated dependencies [3bd8b48]
- Updated dependencies [31b36ca]
- Updated dependencies [d7a9822]
- Updated dependencies [d3e1d9f]
- Updated dependencies [f46cc9f]
- Updated dependencies [5a35322]
- Updated dependencies [753256c]
- Updated dependencies [9680d64]
- Updated dependencies [071df08]
- Updated dependencies [e53d815]
- Updated dependencies [d9ed95c]
  - openapi-chain@0.5.0
