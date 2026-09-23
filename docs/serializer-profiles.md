# Serializer profile experiment

Recorded 2026-09-21 on macOS arm64 / Node 24.16.0, tsdown 0.23.0. Run `pnpm build && pnpm benchmark:profiles`.

The experiment bundles the current strict source entry twice with identical ES2022 browser/minifier/gzip-9 settings. The second build replaces the three call sites reaching structured multipart and URL-encoded serialization with explicit errors, including URL-encoded OAS 3.2 querystring content. Tree shaking then removes unreachable helpers. No repository runtime code or package exports are changed.

| Experimental source bundle | Minified bytes | Gzip bytes |
| -------------------------- | -------------: | ---------: |
| Complete strict            |          21758 |       6797 |
| Without structured forms   |          17380 |       5758 |
| Difference                 |           4378 |       1039 |

Both builds execute JSON and deepObject probes. The full build also serializes URL-encoded and multipart objects; the reduced build rejects them before transport. This is **not** a supported reduced client, a full conformance pass, or a demonstrated registration/plugin architecture. It does not measure separate style profiles. Registration, capability diagnostics, optional entry wiring and additional package validation would add cost, so 1039 bytes is a candidate saving before that unmeasured overhead, not a promised consumer saving.

This source-entry experiment is separate from the emitted-entry size benchmark; use its own full-build control rather than subtracting numbers from another bundling configuration.

## Decision

Keep `@openapi-chain/core/strict` complete and compatible. Do not publish a serializer registration API in this iteration. A roughly 1 KB gross forms saving does not yet justify extra entry points, capability negotiation and cross-profile support. Revisit with measured application demand and a prototype that includes the full registration overhead and preserves extension/validation ordering. Any future reduced client should be an additional opt-in entry, reject missing capabilities before transport, and prove its own wire conformance and package-consumer behavior.

Prioritize explicit schema scoping and build-time metadata delivery. These do not require analyzing Proxy call sites. No bundler-specific source-analysis plugin is planned: dynamic properties, aliases and computed templates require fallback policies whose costs are currently unmeasured. A later tool should first automate the existing explicit-scope workflow if users demonstrate that need.
