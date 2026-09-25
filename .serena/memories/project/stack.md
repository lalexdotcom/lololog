# Stack and commands

pnpm 12 (pinned by `packageManager`), TypeScript 7 (tsgo), Biome 2.5, rslib
(build + .d.ts), rstest 0.12 with `@rstest/browser` (Playwright Chromium),
publint, @arethetypeswrong/cli, tsx. actionlint + ShellCheck come from the
devcontainer.

| Command | Does |
|---|---|
| `pnpm build` / `pnpm dev` | rslib build / watch into `dist/` |
| `pnpm typecheck` | `tsc` on src alone, then on src + tests + scripts + configs |
| `pnpm lint` | `biome check` (CI runs `biome ci`) |
| `pnpm lint:package` | publint + attw (`esm-only`); needs `dist/` |
| `pnpm test` | rstest, projects `node` and `browser` |
| `pnpm test:consumers [fixture...]` | builds, packs, runs the consumer fixtures |
| `actionlint` | lints `.github/workflows/` |