# Release

- Version bump, tag and push belong to the user, through `npx upversion`
  (interactive; it commits, tags and pushes). The agent never bumps, tags or
  pushes.
- A `vX.Y.Z` or `vX.Y.Z-pre` tag triggers `.github/workflows/release.yml`: the
  full CI runs first, then the tag's CHANGELOG section becomes the GitHub
  Release body (GitHub's generated notes appended), and
  `lalexdotcom/action-release-and-publish@v3` publishes to npm with provenance.
- Requires the `NPM_TOKEN` repository secret.