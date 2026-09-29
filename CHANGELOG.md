# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Logger `L` (also exported as `logger`): one method per level, bound to its
  logger so it can be passed as a callback (`wth`, `debug`, `verb`, `info`,
  `success`, `notice`, `warn`, `error`, `crit`, `alert`, `emerg`), severities
  mapped to OpenTelemetry (`LEVELS`), options `enabled`, `level`, `datetime`,
  `color` and `format` (`pretty`, `json`, `logfmt`).
- `L.scope(name)`: named loggers that the root can silence or restrict.
- Output for browser devtools (styled badges), terminals (coloured badges,
  written with `process.stdout.write`, not `console.log`), and pipes (`json`
  by default, `logfmt` or plain `pretty` on request).
- Spinners: `L.<level>.spin(message, options?)` returns a spinner with
  `update`, `close`, `success` and `fail`, unbounded or with a progress
  (`{ progress }` or `{ done, total }`), a custom `glyph` and `color`, and a
  free `status` on `close`. On a terminal with `pretty` output, spinners stay
  at the bottom and animate in place, while `process.stdout.write` /
  `process.stderr.write` are wrapped so other output lands above them;
  elsewhere they write a line per tick, and json/logfmt lines carry a
  `spinner` field with the spinner's `id`, so a collector can rebuild its
  progress across lines. `L.spinnerInterval` sets the tick (80 ms while
  animating in place, 5 s elsewhere; `0` writes the first and last lines
  only).
- `L.<level>.exec(message, callback, options?)`: runs an async task under a
  spinner that ends with `success()` when the task resolves and `fail()` when
  it rejects, returning the task's value or rethrowing its error; the callback
  receives the spinner's `update` as `onProgress`.
- `L.limit(n)` and `L.limit(key, n)`: level methods that show only the first
  `n` lines of their call site, or of every call sharing `key` across levels
  and scopes; calls filtered by `level` or `enabled` do not count. `L.once()`
  and `L.once(key)` do the same with `n = 1`.

### Removed

- The runtime environment flags (`isNode`, `isMainBrowser`, `isWebWorker`,
  `isBrowser`) are no longer exported.
- `describeRuntime()` is no longer exported.

## [0.0.1-alpha.0] - 2026-09-25

### Added

- Package name reservation. Exposes the runtime environment flags (`isNode`,
  `isMainBrowser`, `isWebWorker`, `isBrowser`) only; no logger API yet.
