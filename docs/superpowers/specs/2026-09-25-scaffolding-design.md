# Scaffolding design — lololog

Date: 2026-09-25
Branch: `feat/scaffolding`

## Goal

Set up the tooling of `lololog`, a universal (browser + Node) TypeScript logger
library, before any logger feature is written: build and publication, unit
tests in both environments, consumer tests against real bundlers, CI, release,
changelog, and the Serena memories that record the project's conventions.

Out of scope: the logger API itself. `src/` only holds a placeholder that
exercises the environment detection, so every tool in the chain has something
real to build, test and consume.

## Constraints

- Package manager: pnpm, pinned by `packageManager` in `package.json`.
- Biome is already configured (`biome.json`) and covers every new file.
- TypeScript 7 (`typescript@7.0.2`) is installed; `rsbuild-plugin-dts@1.0.2`
  accepts it (peer `^5 || ^6 || ^7`).
- Versioning belongs to the user: `npx upversion` bumps `package.json`,
  commits, tags and pushes. The agent never bumps, tags or pushes.
- Imports are relative and extensionless; no path aliases.
- CI logic stays inline shell in `run:` blocks (AGENTS.md § Scripts).

## Decisions

| Topic | Decision |
|---|---|
| Output format | ESM only, with `.d.ts` |
| Node floor | `>=22`; CI on Node 22 and 24; release on `lts/*` |
| Environment strategy | Single build, runtime detection, dynamic `node:*` imports |
| Unit tests | Rstest, two projects: `node` and `browser` (Playwright Chromium) |
| Consumer tests | Packed tarball installed with npm into fixture projects |
| Changelog | Keep a Changelog 1.1.0, `[Unreleased]` fed with each change |
| Release notes | CHANGELOG section of the tag, passed as `release-notes-file` |

## 1. Structure and build

```
src/
  index.ts              public entry; placeholder using the env detection
  env/
    detect.ts           runtime environment detection
    node-import.ts      single entry point for dynamic node:* imports
tests/
  *.test.ts             rstest unit tests, run in node and browser projects
  consumers/            consumer fixtures (section 3)
rslib.config.ts
rstest.config.ts
tsconfig.json
CHANGELOG.md
```

### Build (`rslib.config.ts`)

- One lib entry, `format: "esm"`, `bundle: true`, `dts: true`,
  `syntax: "es2022"`, output to `dist/`.
- `node:*` specifiers are external.

### Runtime environment detection

- `src/env/detect.ts` decides the environment from globals, e.g.
  `globalThis.process?.versions?.node`. It imports nothing from Node.
- `src/env/node-import.ts` is the only module allowed to load a Node built-in.
  It calls `import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)`
  with a non-literal specifier. A literal `import("node:fs")` makes webpack
  fail on a web target (`UnhandledSchemeError`) and makes Vite warn
  ("externalized for browser compatibility"). The magic comments and the
  non-literal specifier keep bundlers from resolving it.
- The helper is only reached behind a positive Node detection.
- Whether the magic comments survive the rslib build is not guaranteed; the
  consumer tests (section 3) are what proves it.

### `package.json`

npm-facing fields:

- Identity: `name`, `version`,
  `description`: `"Universal logger: log everywhere with style and low overhead"`,
  `keywords`: `logger`, `logging`, `log`, `universal`, `isomorphic`, `browser`,
  `node`, `typescript`, `esm`; `license` (`MIT`), `author` (kept).
- Links: `homepage` (`https://github.com/lalexdotcom/lololog#readme`),
  `repository` (`{ "type": "git", "url": "git+https://github.com/lalexdotcom/lololog.git" }`),
  `bugs` (`https://github.com/lalexdotcom/lololog/issues`). npm provenance
  requires `repository` to match the publishing GitHub repo.
- Resolution: `"type": "module"`,
  `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }`,
  top-level `"types": "./dist/index.d.ts"`, `"files": ["dist"]`,
  `"sideEffects": false`, `"engines": { "node": ">=22" }`.
- Publication: `"publishConfig": { "access": "public", "provenance": true }`.

Scripts: `build` (`rslib build`), `dev` (`rslib build --watch`),
`typecheck` (`tsc --noEmit`), `lint` (`biome check`), `test` (`rstest`),
`lint:package` (`publint` then `attw --pack . --profile esm-only`).

New devDependencies: `@rslib/core`, `@rstest/core`, `@rstest/browser`,
`publint`, `@arethetypeswrong/cli`.

- `publint` checks `package.json` against the files actually published:
  `exports` targets, `files`, condition order.
- `attw` checks that TypeScript resolves the types correctly under every
  `moduleResolution` mode a consumer may use; `--profile esm-only` skips the
  `require()` modes the package does not support.
- `pnpm-workspace.yaml` `allowBuilds` gains any build script the new
  dependencies require, reviewed one by one.

### `tsconfig.json`

- `strict: true`, `module: "esnext"`, `moduleResolution: "bundler"`,
  `target: "es2022"`, `lib: ["es2022", "dom"]`, `noEmit: true`.
- No `@types/node`: `detect.ts` types its own global access, so the typecheck
  flags any stray Node global in `src/`.
- `include`: `src`, `tests`, the root config files. `exclude`:
  `tests/consumers`.

## 2. CI workflow (`.github/workflows/ci.yml`)

Triggers: `push` to `main`, `pull_request`, `workflow_call` (reused by the
release). `concurrency` per ref with `cancel-in-progress`.

Jobs:

1. **`check`** (Node 24): `pnpm install --frozen-lockfile`, `biome ci`,
   `pnpm typecheck` (src + tests), `pnpm build`, `pnpm lint:package`,
   `pnpm pack`, upload the tarball as an artifact.
2. **`test`** (matrix Node 22 / 24): rstest `node` project on both versions.
   The `browser` project runs on one matrix entry only, after
   `pnpm exec playwright install --with-deps chromium`; the browser result
   does not depend on the Node version.
3. **`consumers`** (`needs: check`, matrix over fixtures): section 3.

pnpm is installed by `pnpm/action-setup`, which reads `packageManager`.

## 3. Consumer tests

Fixtures live in `tests/consumers/<name>/`, each with its own `package.json`.
They are excluded from rstest, from the root typecheck and from the pnpm
workspace.

In CI, each fixture is copied to `$RUNNER_TEMP` and installs the packed
tarball with `npm install <tarball>`, so nothing leaks from the repo's pnpm
setup or `node_modules`.

| Fixture | Checks |
|---|---|
| `node` | `index.mjs` imports `lololog`, runs, exits non-zero unless the Node branch was taken; `tsc --noEmit` with `moduleResolution: "nodenext"` |
| `rsbuild` | Web build with zero warnings; bundle run in Chromium takes the browser branch |
| `rspack` | Same as `rsbuild` |
| `webpack` | Same as `rsbuild` (webpack 5) |
| `vite` | Same as `rsbuild`; plus `tsc --noEmit` with `moduleResolution: "bundler"` |

- **Zero warnings**: each bundler fixture exits non-zero when its bundler
  reports a warning — `stats.hasWarnings()` for webpack and rspack, an
  `onwarn` that throws for Vite, the equivalent hook for Rsbuild.
- **Browser run**: a shared harness, `tests/consumers/run-in-browser.mjs`
  (Playwright), serves the fixture's output directory, loads the page and
  reads a result the bundle exposes on `window`. It exits non-zero on a
  missing or wrong result, or on any page error.

## 4. Release and changelog

### `CHANGELOG.md`

Keep a Changelog 1.1.0. Starts with an empty `## [Unreleased]` section.
Entries go under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
`Security`. Every user-visible change adds its entry to `[Unreleased]` in the
same commit.

### Delivery flow

1. Before `npx upversion`, `## [Unreleased]` becomes
   `## [x.y.z] - YYYY-MM-DD` and a new empty `## [Unreleased]` is added above
   it. The agent does this on request; the bump itself stays with the user.
2. `upversion` pushes the tag `vx.y.z`.

### `.github/workflows/release.yml`

Triggers: tags `v*.*.*` and `v*.*.*-*`.

Jobs:

1. **`ci`**: `uses: ./.github/workflows/ci.yml`. A tag never publishes red code.
2. **`release`** (`needs: ci`, `permissions: contents: write, id-token: write`;
   `id-token` is what npm provenance signs with, the action publishing through
   `npm publish` which reads `publishConfig.provenance`):
   1. checkout;
   2. inline shell (`awk`) extracts the `## [x.y.z]` section matching the tag
      (without the `v`) into `$RUNNER_TEMP/release-notes.md`. The job fails if
      the section is missing or empty, prereleases included;
   3. `lalexdotcom/action-release-and-publish@v3` with `publish: true`,
      `npm-token: ${{ secrets.NPM_TOKEN }}`,
      `github-token: ${{ secrets.GITHUB_TOKEN }}`,
      `release-notes-file` set to the extracted file, `node-version: lts/*`.
      The action appends GitHub's generated notes after that content.

Prerequisite outside the repo: the `NPM_TOKEN` repository secret.

## 5. Serena memories

Written in `.serena/memories/` during implementation, describing what exists
rather than intent. Nothing already stated in AGENTS.md is repeated.

| Memory | Content |
|---|---|
| `project/overview` | Universal logger; product goals: low overhead and a pleasant look. ESM only, Node ≥ 22, runtime detection, single `node:*` helper and why the magic comments |
| `project/stack` | pnpm, Biome, TypeScript 7, rslib, rstest + `@rstest/browser`, publint, attw, tsx, actionlint + ShellCheck (devcontainer); commands |
| `conventions/code-style` | Relative extensionless imports, no aliases |
| `conventions/workflow` | Every piece of work on a feat-branch, opened before the spec is committed; implementation in subagent mode by default (`superpowers:subagent-driven-development`), inline only on request; before delivery `biome ci`, `typecheck`, `test`, `build` green; after the merge, Serena memories updated |
| `conventions/testing` | `tests/` sibling of `src/`, node and browser projects, consumer fixtures and when to add one |
| `conventions/changelog` | `[Unreleased]` entry in the same commit, format, delivery preparation |
| `conventions/release` | Bump, tag and push by the user only via `npx upversion`; `release.yml` behaviour; `NPM_TOKEN` |

Further conventions from the user go under `conventions/<topic>`.

## Success criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass locally, both
  rstest projects included.
- The built `dist/index.js` still carries the `webpackIgnore` / `@vite-ignore`
  comments on the `node:*` dynamic import.
- Every consumer fixture passes locally against a packed tarball.
- `pnpm lint:package` passes (publint and attw).
- `actionlint` reports nothing on both workflows, ShellCheck included (both
  installed by the devcontainer).
- The Serena memories listed above exist.
