# Changesets

Run `pnpm changeset` to describe a user-facing change. Commit the generated file
with your implementation. The release workflow combines pending changesets into
a version pull request and generates `CHANGELOG.md`.

This repository starts with an empty API at version `0.0.0`. Add a minor changeset
with the initial implementation to prepare `0.1.0`; engineering setup alone does
not create a release.

See [the contributor guide](../CONTRIBUTING.md) for the full release workflow.
