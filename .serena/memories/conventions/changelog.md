# Changelog

- `CHANGELOG.md` follows Keep a Changelog 1.1.0: sections `Added`, `Changed`,
  `Deprecated`, `Removed`, `Fixed`, `Security` under `## [Unreleased]`.
- Every user-visible change adds its entry under `[Unreleased]` in the same
  commit as the change.
- Every `## [...]` heading has its link definition at the bottom of the file,
  newest first, as Keep a Changelog prescribes: `[Unreleased]` compares the
  last tag with `HEAD`
  (`https://github.com/lalexdotcom/lololog/compare/vX.Y.Z...HEAD`), each
  version compares the previous tag with its own (`compare/vPREV...vX.Y.Z`),
  and the first version points to its tag (`releases/tag/v0.0.1-alpha.0`).
- Preparing a delivery (on request): rename `## [Unreleased]` to
  `## [x.y.z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it;
  at the bottom, make `[Unreleased]` start from `vx.y.z` and add the
  `[x.y.z]` line under it. The release fails if the tag's section is missing
  or empty.
- `release.yml` cuts a section at the next `## [` heading, so the definitions
  never reach a release body, except the oldest section's, where they render
  as nothing.