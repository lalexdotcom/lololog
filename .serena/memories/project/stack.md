# Stack and commands

pnpm 12 (pinned by `packageManager`), TypeScript 7 (tsgo), Biome 2.5, rslib
(build + .d.ts), rstest 0.12 with `@rstest/browser` (Playwright Chromium,
Firefox, WebKit), publint, @arethetypeswrong/cli, tsx, bun (devDependency, for
trying Bun by hand; the `bun` consumer fixture installs its own). actionlint +
ShellCheck come from the devcontainer.

Never `pnpm add bun`: pnpm 12 takes it as a package-manager switch and
rewrites `packageManager` into `devEngines.packageManager: bun`, even with a
version. Edit the range in package.json, then `pnpm install`. bun's
postinstall is allowed in `pnpm-workspace.yaml` (`allowBuilds`: pnpm fails
the install without it). The fixture's `allowScripts` only silences npm 11's
warning: with `strict-allow-scripts` false (the default), npm runs the
postinstall either way.

| Command | Does |
|---|---|
| `pnpm build` / `pnpm dev` | rslib build / watch into `dist/` |
| `pnpm typecheck` | `tsc` on src alone, then on src + tests + scripts + configs |
| `pnpm lint` | `biome check` (CI runs `biome ci`) |
| `pnpm lint:package` | publint + attw (`esm-only`); needs `dist/` |
| `pnpm test` | rstest, projects `node`, `browser-chromium`, `browser-firefox`, `browser-webkit`, one run each |
| `pnpm test:consumers [fixture...]` | builds, packs, runs the consumer fixtures |
| `actionlint` | lints `.github/workflows/` |
| `pnpm playground:tty` / `:no-tty` / `:json` / `:logfmt` | runs `scripts/playground/demo.ts` against `src/` in that output (no-tty re-runs itself with piped stdout per format) |
| `pnpm playground:web` | rsbuild dev server on `0.0.0.0:3000` for `scripts/playground/web`, importing `src/` directly (HMR on src edits) |