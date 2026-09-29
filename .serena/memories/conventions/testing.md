# Testing

- Unit tests live in `tests/` (sibling of `src/`), `*.test.ts`. Every test file
  runs in four rstest projects: `node`, `browser-chromium`, `browser-firefox`,
  `browser-webkit` (one per JS engine); branch on
  `typeof window === "undefined"` when the expectation differs. rstest 0.12
  refuses two browsers in one run, so `pnpm test` and CI run each project on
  its own (`rstest run --project <name>`).
- JavaScriptCore (WebKit, Safari, Bun) drops the frame of a function that
  tail-calls: a test helper that calls into lololog must not do it in tail
  position (`return f()`, arrow expression body), or stack-based keys shift.
- Environment detection lives in pure predicates taking a `scope`; the
  exported flags apply them to `globalThis`. Tests simulate other runtimes by
  passing plain objects to the predicates, and check the flags against the
  runtime actually running them.
- Terminal output is tested through `tests/fake-terminal.ts` (injected as
  `Environment.terminal`: captured writes, deferred callbacks, exit), so
  LiveSink and spinner tests run in both projects; timers through
  `rs.useFakeTimers()`.
- Consumer fixtures live in `tests/consumers/<name>/`, each with its own
  `package.json` and `npm run check`. They install the packed tarball with
  npm. Browser fixtures build into `dist/` with an `index.html` whose bundle
  sets `window.__result`; `tests/consumers/run-in-browser.mjs` checks it in
  Chromium.
- Adding a fixture means adding it to both `scripts/test-consumers.ts` and the
  `consumers` matrix of `.github/workflows/ci.yml`. Add one when a new
  consumer toolchain or a new `exports` entry needs proving.
- Fixture dependencies (webpack, vite, rsbuild, rspack) are deliberately
  unpinned (`^` ranges, no lockfile), so CI tests against the latest releases
  consumers would install; the cost is a new bundler warning can fail CI with
  no repo change. When that happens, investigate the new warning and pin the
  dependency only if it turns out to be a bundler bug.