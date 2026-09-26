# Compatibility and versioning

[Documentation index](README.md) · [API reference](api.md) · [Support boundaries](support.md)

This policy defines the public contracts being stabilized for 1.0. Before 1.0, incompatible public changes require a minor release and migration guidance. From 1.0, each package follows semantic versioning: compatible fixes are patches, compatible additions are minors, and incompatible public changes require a major release.

## Public API

The supported import paths are `openapi-chain`, `openapi-chain/strict`, `openapi-chain/metadata`, and `@openapi-chain/query`. The CLI exposes the `openapi-chain` executable, its documented flags/configuration, generated modules and exit status. Published `package.json` exports are supported for package/version inspection. Deep imports into `dist`, `src` or generated implementation chunks are not public APIs.

All named exports from the supported entry points are public, including type-only exports. The reviewed source inventories are [core](../packages/core/src/index.ts), [strict](../packages/core/src/strict.ts), [metadata](../packages/core/src/metadata.ts) and [query](../packages/query/src/index.ts). A new export requires an intentional compatibility decision and user-facing documentation.

`CoreClientOptions` and `StrictClientOptions` describe their respective constructors. `ClientOptions` and `RequestInput` are broader shared shapes; they do not authorize every field at every operation. Use `OperationInputFor` and `OperationExtensionsFor` for reusable operation inputs and extensions. The generic parameter order and defaults of these helpers, `API`, result types and metadata record types are part of the contract.

`OpenAPIMetadata` and its component types describe the artifact structure for inspection. Only compiler/CLI output provides `CompiledOpenAPIMetadata` for strict execution. The former identity helper `defineOpenAPIMetadata` has been removed; use compilation for runtime artifacts or `satisfies OpenAPIMetadata` to describe a partial table without claiming it is executable.

## What requires a breaking release

- Removing or renaming an export, config field, documented CLI flag or generated module.
- Rejecting a previously supported input, requiring another argument, or narrowing a previously supported TypeScript assignment. TypeScript source compatibility counts even when emitted JavaScript is unchanged.
- Changing supported serialization defaults, extension order/invocation, response parser values or the `throwOnError` result/throw behavior.
- Changing the Query key layout, normalization, snapshot identity or cancellation contract.
- Raising the minimum supported compiler/runtime or removing a supported module format.

A correction that makes a supported consumer stop compiling or changes its documented wire behavior still needs a breaking release. Patches may reject inputs already explicitly outside the support contract, repair behavior that contradicted that contract, or improve diagnostics without changing stable error fields. Every behavior change needs a changeset explaining its scope; migration notes must describe stricter input or regeneration requirements. Security fixes follow the same compatibility review, with coordinated disclosure when necessary.

Error messages, stack traces, generated formatting, compiler diagnostic wording and benchmark timings are not stable string APIs. `OpenAPIChainError` remains a `TypeError` subclass. Its documented `code`, operation `method`/`pathTemplate` context and cause preservation are stable. Adding an error-code union member can break exhaustive consumers and needs the corresponding compatibility review. HTTP, transport, native platform and user callback errors retain the identities described in the API reference.

## Compiled metadata format

`metadata.version` is a serialization artifact format version, independent of the npm version and the source OpenAPI version. The current format is **1**. The 1.x runtime line will continue accepting valid format-1 artifacts produced by the supported compiler, including the checked-in 0.5.2 compatibility fixture. Unknown artifact versions fail at client construction before user callbacks or transport.

Format 1 fixes the meaning of its existing execution fields. A new field that an older runtime would need to interpret to serialize or reject a request correctly, a changed field meaning, or an incompatible shape requires a new artifact version. The emitting CLI must then require a runtime that supports that version. A newer 1.x runtime may add support for a new format while retaining format 1; dropping an already supported format requires a runtime major release. Non-execution annotations may be additive, but cannot silently change request semantics.

Runtime compatibility preserves how an existing artifact is interpreted. It cannot repair serialization information that an older compiler omitted or inferred incorrectly. Compiler fixes may therefore require **regenerating all four CLI files** even when the artifact format remains 1. A release note must call out that requirement. Commit the generated manifest and run `generate --check` with the locked CLI version after upgrades; it regenerates expected output and detects changes in versions, hashes and content.

Keep the CLI, runtime, schema and generated files in one application's lockfile/review. Updating only runtime does not apply compiler fixes. A manifest hash cannot prove that an erased handwritten TypeScript type matches the document, and runtime does not treat arbitrary JSON or a type assertion as a validated artifact.

The [frozen 0.5.2 artifact fixture](../test/fixtures/metadata-v1-0.5.2/README.md) is consumed by the current strict runtime in CI without recompiling it. Before introducing another artifact version, add an immutable fixture and exercise supported old/new combinations, unknown-version rejection and installed-package consumers. Do not overwrite an old fixture to make a compatibility test pass.

## Query cache contract

`createQuery` owns an immutable snapshot of the operation prefix and input. Its key is a readonly tuple `[...prefix, inputSnapshot]`. Object keys are sorted, array order is preserved, negative zero is normalized to zero, and unsupported non-JSON values are rejected. Fetchers receive that same deeply frozen input snapshot. `ReadonlyQueryInput<T>` describes its type; nested arrays must remain readonly or be explicitly copied when passing to an API that requires mutable arrays.

Include every response-affecting server/account/permission scope in the non-secret prefix or input. TanStack's signal is forwarded; SWR receives `signal: null`. Framework hashing algorithms are owned by the framework. The adapter preserves its documented key representation across compatible releases; a change must not silently alias previously distinct request inputs.

## Supported toolchains and platforms

The minimum supported application compiler is **TypeScript 6.0.3**, with strict mode and Fetch/DOM types. CI checks the exact pins **6.0.3** and **7.0.2** against source, generated declarations, isolated ESM/CommonJS consumers and type-complexity budgets. TypeScript 7.0.2 is the recommended checked baseline for large schemas. Other compiler versions may work, but enter the maintained support table only after the same qualification. CLI's internal TypeScript 5.9.3 serves its generator and is not an application compiler support promise.

Node.js support follows each package's `engines` range. CI currently checks Node 22.22.2, 24.16.0 and 26 on Linux, and Node 24.16.0 on Windows/macOS. The development toolchain may require a newer patch than runtime consumers. Both ESM and CommonJS are supported by runtime and Query; CLI runs as a Node executable. Browser support is qualified in Chromium with standard Fetch APIs. Firefox, WebKit and individual edge runtimes need separate qualification before being advertised as supported platforms.

The CLI generates OpenAPI 3.0/3.1 declarations and metadata. Manual metadata compilation also supports OpenAPI 3.2; it still needs matching application types and a transport that supports the selected operations. The [support matrix](support.md) defines serialization limits, including external references, advanced multipart, response validation and platform restrictions.

## Package releases and the 1.0 candidate

The runtime, CLI and Query packages are versioned independently; equal current versions do not imply a lockstep policy. CLI's runtime dependency range must include the compiler/runtime features it emits. Query has no runtime dependency on the client package. A change to one package does not automatically require releasing unrelated packages.

Before a stable release, run the full local/remote quality gates, Chromium, fixed corpus baselines and registry-installed consumer checks. Verify the private security reporting channel and versioned release notes. Publish release candidates to a prerelease dist-tag, keep `latest` on the stable line, and validate representative consumers through schema changes, generation, HTTP success/error responses, multipart and cancellation. Promote only after those checks pass and incompatible changes have migration guidance. Release candidates and stable publication are explicit maintainer release operations; ordinary implementation commits do not publish a package.
