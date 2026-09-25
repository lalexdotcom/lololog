# Changelog

- `CHANGELOG.md` follows Keep a Changelog 1.1.0: sections `Added`, `Changed`,
  `Deprecated`, `Removed`, `Fixed`, `Security` under `## [Unreleased]`.
- Every user-visible change adds its entry under `[Unreleased]` in the same
  commit as the change.
- Preparing a delivery (on request): rename `## [Unreleased]` to
  `## [x.y.z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it.
  The release fails if the tag's section is missing or empty.