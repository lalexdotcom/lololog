# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Logger `L` (also exported as `logger`): one method per level (`wth`, `debug`,
  `verb`, `info`, `success`, `notice`, `warn`, `error`, `crit`, `alert`,
  `emerg`), severities mapped to OpenTelemetry (`LEVELS`), options `enabled`,
  `level`, `datetime`, `color` and `format` (`pretty`, `json`, `logfmt`).
- `L.scope(name)`: named loggers that the root can silence or restrict.
- Output for browser devtools (styled badges), terminals (coloured badges),
  and pipes (`json` by default, `logfmt` or plain `pretty` on request).

### Removed

- The runtime environment flags (`isNode`, `isMainBrowser`, `isWebWorker`,
  `isBrowser`) are no longer exported.
- `describeRuntime()` is no longer exported.

## [0.0.1-alpha.0] - 2026-09-25

### Added

- Package name reservation. Exposes the runtime environment flags (`isNode`,
  `isMainBrowser`, `isWebWorker`, `isBrowser`) only; no logger API yet.
