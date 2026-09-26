# Documentation

[Project overview](../README.md)

## Use the client

| Read | When you need |
| --- | --- |
| [Getting started](getting-started.md) | Install, generate types and run an offline example |
| [Package names](migration-to-scope.md) | Keep runtime imports and migrate CLI and query dependencies |
| [Query libraries and mocks](integrations.md) | Integrate TanStack Query, SWR and MSW with executable recipes |
| [Official CLI](cli.md) | Generate synchronized types, scopes and metadata; check drift in CI |
| [API reference](api.md) | Options, path calls, request bodies, errors, extensions and transport |
| [Support and boundaries](support.md) | Decide whether a wire format, schema feature or platform is supported |
| [Core to strict migration](migration.md) | Stage a migration, preserve intentional response contracts and review wire changes |
| [Offline migration checks](migration-check.md) | Compare core and strict requests and parsed values before switching |
| [Troubleshooting](troubleshooting.md) | Diagnose type errors, serialization failures and Fetch behavior |
| [Performance](performance.md) | Reproduce size, runtime and TypeScript measurements |

## Contribute and maintain

| Read | When you need |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Prepare a change, tests, changeset and commit |
| [Development](development.md) | Set up tools, run checks or configure releases |
| [Architecture](architecture.md) | Understand type inference and runtime package boundaries |
| [Corpus regression checks](corpus.md) | Run fixed external failure shapes and review full corpus baselines |
| [Conformance fixtures](../test/fixtures/README.md) | Understand independent wire/type expectations |
| [Security](../SECURITY.md) | Report a vulnerability privately |
| [Core changelog](../packages/core/CHANGELOG.md) | Read runtime release history |
| [Legacy changelog](legacy-changelog.md) | Consult history predating the current implementation |

## Historical evidence

The [qualification archive](archive/qualification/README.md) preserves dated verification reports, measurement environments and release limitations. Consult it for historical evidence; use the guides above for current behavior.

For large schemas, follow the [runnable scope and build-time metadata workflow](large-schemas.md).

See the [serializer-profile experiment and decision](serializer-profiles.md) for measured optional-runtime tradeoffs.
