# Testing

- Unit tests live in `tests/` (sibling of `src/`), `*.test.ts`. Every test file
  runs in both rstest projects, `node` and `browser`; branch on
  `typeof window === "undefined"` when the expectation differs.
- Environment detection lives in pure predicates taking a `scope`; the
  exported flags apply them to `globalThis`. Tests simulate other runtimes by
  passing plain objects to the predicates, and check the flags against the
  runtime actually running them.
- Consumer fixtures live in `tests/consumers/<name>/`, each with its own
  `package.json` and `npm run check`. They install the packed tarball with
  npm. Browser fixtures build into `dist/` with an `index.html` whose bundle
  sets `window.__result`; `tests/consumers/run-in-browser.mjs` checks it in
  Chromium.
- Adding a fixture means adding it to both `scripts/test-consumers.ts` and the
  `consumers` matrix of `.github/workflows/ci.yml`. Add one when a new
  consumer toolchain or a new `exports` entry needs proving.