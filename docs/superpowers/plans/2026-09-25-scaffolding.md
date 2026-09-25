# Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `lololog` its full tooling — build, unit tests in Node and Chromium, consumer tests against real bundlers, CI, release, changelog, Serena memories — around a placeholder that exercises runtime environment detection.

**Architecture:** One ESM bundle built by rslib. Module-level flags (`isNode`, `isMainBrowser`, `isWebWorker`, `isBrowser`) detect the environment once at load and the code reaches Node built-ins only through `process.getBuiltinModule`, so no bundler ever sees a `node:*` import. Unit tests run the same files in a `node` and a `browser` rstest project; consumer fixtures install the packed tarball with npm and build it with rsbuild, rspack, webpack and vite.

**Tech Stack:** pnpm 12, TypeScript 7 (tsgo), Biome 2.5, rslib 1.0, rstest 0.12 + `@rstest/browser` (Playwright Chromium), publint, `@arethetypeswrong/cli`, GitHub Actions, `lalexdotcom/action-release-and-publish@v3`.

**Spec:** `docs/superpowers/specs/2026-09-25-scaffolding-design.md`

## Global Constraints

- Package manager: pnpm, pinned by `"packageManager": "pnpm@12.6.0"`. Add dependencies with `pnpm add -D`, never by hand-editing versions.
- Node floor: `"engines": { "node": ">=22.3.0" }`. CI on Node 22 and 24; release on `lts/*`.
- Output: ESM only, `.d.ts` included. No CJS, no UMD.
- Imports are relative and extensionless (`from "./env/detect"`); no path aliases.
- `src/` never references a Node global or imports a `node:*` module; Node built-ins go through `getNodeBuiltin` only.
- CI logic stays inline shell in `run:` blocks. Human-run helpers go in `scripts/`, in TypeScript, run with `pnpm exec tsx`.
- Formatting: Biome, tabs, line width 100. Run `pnpm exec biome check --write <files>` after every modification.
- Comments say why, never what (AGENTS.md § Comments). Keep the ones given in this plan; add none that restate code.
- Code files are read and edited through Serena's symbolic tools (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, `replace_content`, …); built-in Read/Edit only for non-code files (JSON, YAML, Markdown) or when Serena fails. New files may be created with Write.
- Commits: Conventional Commits, body explains why, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bump the version, tag or push.
- Work happens on branch `feat/scaffolding` (already checked out).

## Review Focus

- A browser bundle with a `process` polyfill (`process/browser`: `{ env: {}, versions: {}, browser: true }`), or a smarter one faking `versions.node` and `getBuiltinModule`: `isNode` must stay false, since only the native `process` carries the `[object process]` tag. Pinned in Task 1.
- A jsdom test environment or an Electron renderer exposes a DOM next to a real Node `process`: both `isNode` and `isMainBrowser` must be true. Pinned in Task 1.
- A native `process` without `getBuiltinModule` (Node older than 22.3, engines ignored): `isNode` is false and `getNodeBuiltin` returns `undefined` without throwing. Pinned in Task 1.
- Deno and edge runtimes define `self` without being web workers: `isWorkerScope` must require `self instanceof WorkerGlobalScope`, not `self` alone. Pinned in Task 1.
- A prerelease tag next to its stable section: `v1.0.0-beta.1` must extract `## [1.0.0-beta.1]` and never `## [1.0.0]`, and a tag with no or an empty section must fail the release. Pinned in Task 5.

---

### Task 1: Environment detection, unit tests in Node and Chromium, typecheck

**Files:**
- Create: `src/env/detect.ts`, `src/env/node-builtin.ts`, `src/index.ts`
- Create: `tests/detect.test.ts`, `tests/node-builtin.test.ts`, `tests/index.test.ts`
- Create: `tsconfig.json`, `tsconfig.build.json`, `rstest.config.ts`
- Modify: `package.json` (devDependencies, `scripts.typecheck`, `scripts.test`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/env/detect.ts`: predicates `isNodeScope(scope: object): boolean`, `hasDocument(scope: object): boolean`, `isWorkerScope(scope: object): boolean`; flags `isNode`, `isMainBrowser`, `isWebWorker`, `isBrowser` (`boolean` constants computed from `globalThis` at module load).
  - `src/env/node-builtin.ts`: `export function getNodeBuiltin<T>(name: string, scope: object = globalThis): T | undefined`
  - `src/index.ts` (public entry): `export { isBrowser, isMainBrowser, isNode, isWebWorker }` and `export function describeRuntime(): string` — returns `"node:<platform>"` (`"node:unknown"` if `os` is unreachable), `"browser"`, `"worker"` or `"unknown"`, checked in that order. The predicates stay internal.
  - `tsconfig.build.json` (Task 2's build uses it), `pnpm typecheck`, `pnpm test`.

- [ ] **Step 1: Install the test and type dependencies**

```bash
pnpm add -D @rstest/core@^0.12.1 @rstest/browser@^0.12.1 @types/node@^22
```

Expected: install succeeds. If pnpm reports an ignored build script for a new dependency, stop and report it: `pnpm-workspace.yaml` `allowBuilds` entries are reviewed one by one, never added blindly.

- [ ] **Step 2: Create the TypeScript configs**

`tsconfig.json`:

```json
{
	"compilerOptions": {
		"strict": true,
		"target": "es2022",
		"module": "esnext",
		"moduleResolution": "bundler",
		"lib": ["es2022", "dom"],
		"types": ["node"],
		"isolatedModules": true,
		"verbatimModuleSyntax": true,
		"skipLibCheck": true,
		"noEmit": true
	},
	"include": ["src", "tests", "scripts", "*.config.ts"],
	"exclude": ["tests/consumers"]
}
```

`tsconfig.build.json`:

```json
{
	// src/ alone, without Node types: @rstest/core's declarations pull @types/node
	// into any program that includes tests/, which would let a Node global in src/
	// typecheck. Also roots the rslib .d.ts output at dist/ instead of dist/src/.
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"rootDir": "src",
		"types": []
	},
	"include": ["src"]
}
```

- [ ] **Step 3: Create the rstest config**

`rstest.config.ts`:

```ts
import { defineConfig } from "@rstest/core";

export default defineConfig({
	projects: [
		{
			name: "node",
			include: ["tests/**/*.test.ts"],
			testEnvironment: "node",
		},
		{
			name: "browser",
			include: ["tests/**/*.test.ts"],
			// The devcontainer has no display; CI is headless by default anyway.
			browser: { enabled: true, provider: "playwright", headless: true },
		},
	],
});
```

- [ ] **Step 4: Add the scripts**

In `package.json`, add to `"scripts"` (create the object after `"license"` if missing):

```json
"typecheck": "tsc --noEmit -p tsconfig.build.json && tsc --noEmit",
"test": "rstest run"
```

- [ ] **Step 5: Write the failing tests**

`tests/detect.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import {
	hasDocument,
	isBrowser,
	isMainBrowser,
	isNode,
	isNodeScope,
	isWebWorker,
	isWorkerScope,
} from "../src/env/detect";

const inNode = typeof window === "undefined";

function nativeLookingProcess(extra: object = {}): object {
	return { [Symbol.toStringTag]: "process", ...extra };
}

describe("isNodeScope", () => {
	test("recognises the native process of the runtime running the tests", () => {
		expect(isNodeScope(globalThis)).toBe(inNode);
	});

	test("accepts a process tagged as native with getBuiltinModule", () => {
		const process = nativeLookingProcess({ getBuiltinModule: () => undefined });
		expect(isNodeScope({ process })).toBe(true);
	});

	test("rejects the process/browser polyfill", () => {
		expect(isNodeScope({ process: { env: {}, versions: {}, browser: true } })).toBe(false);
	});

	test("rejects a plain object faking versions.node and getBuiltinModule", () => {
		const process = { versions: { node: "24.0.0" }, getBuiltinModule: () => undefined };
		expect(isNodeScope({ process })).toBe(false);
	});

	test("rejects a native process without getBuiltinModule (Node < 22.3)", () => {
		expect(isNodeScope({ process: nativeLookingProcess() })).toBe(false);
	});

	test("rejects a scope without process", () => {
		expect(isNodeScope({})).toBe(false);
	});
});

describe("hasDocument", () => {
	test("accepts a window with a document", () => {
		expect(hasDocument({ window: { document: {} } })).toBe(true);
	});

	test("rejects a window without a document", () => {
		expect(hasDocument({ window: {} })).toBe(false);
	});

	test("rejects a scope without window", () => {
		expect(hasDocument({})).toBe(false);
	});

	test("coexists with a native process (jsdom, Electron renderer)", () => {
		const process = nativeLookingProcess({ getBuiltinModule: () => undefined });
		const scope = { process, window: { document: {} } };
		expect([isNodeScope(scope), hasDocument(scope)]).toEqual([true, true]);
	});
});

describe("isWorkerScope", () => {
	class WorkerGlobalScope {}

	test("accepts a self inheriting from WorkerGlobalScope", () => {
		expect(isWorkerScope({ self: new WorkerGlobalScope(), WorkerGlobalScope })).toBe(true);
	});

	test("rejects self alone (Deno, edge runtimes)", () => {
		expect(isWorkerScope({ self: {} })).toBe(false);
	});

	test("rejects a self that is not a WorkerGlobalScope", () => {
		expect(isWorkerScope({ self: {}, WorkerGlobalScope })).toBe(false);
	});
});

describe("flags", () => {
	test("describe the runtime running the tests", () => {
		expect({ isNode, isMainBrowser, isWebWorker, isBrowser }).toEqual({
			isNode: inNode,
			isMainBrowser: !inNode,
			isWebWorker: false,
			isBrowser: !inNode,
		});
	});
});
```

`tests/node-builtin.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { getNodeBuiltin } from "../src/env/node-builtin";

describe("getNodeBuiltin", () => {
	test("returns undefined without a process", () => {
		expect(getNodeBuiltin("os", {})).toBeUndefined();
	});

	test("returns undefined when process has no getBuiltinModule (Node < 22.3, polyfill)", () => {
		expect(getNodeBuiltin("os", { process: { versions: {} } })).toBeUndefined();
	});

	test("asks getBuiltinModule for the node: prefixed id", () => {
		const requested: string[] = [];
		const builtin = { marker: true };
		const scope = {
			process: {
				getBuiltinModule: (id: string) => {
					requested.push(id);
					return builtin;
				},
			},
		};
		expect(getNodeBuiltin("os", scope)).toBe(builtin);
		expect(requested).toEqual(["node:os"]);
	});

	test("reaches the real os built-in in Node only", () => {
		const os = getNodeBuiltin<{ platform(): string }>("os");
		if (typeof window === "undefined") {
			expect(typeof os?.platform()).toBe("string");
		} else {
			expect(os).toBeUndefined();
		}
	});
});
```

`tests/index.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { describeRuntime } from "../src/index";

describe("describeRuntime", () => {
	test("names the runtime, with the platform under Node", () => {
		if (typeof window === "undefined") {
			expect(describeRuntime()).toMatch(/^node:\w+$/);
			expect(describeRuntime()).not.toBe("node:unknown");
		} else {
			expect(describeRuntime()).toBe("browser");
		}
	});
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL in both projects — the imports `../src/env/detect`, `../src/env/node-builtin`, `../src/index` cannot be resolved.

- [ ] **Step 7: Implement the detection**

`src/env/detect.ts`:

```ts
interface RuntimeScope {
	process?: { getBuiltinModule?: unknown };
	window?: { document?: unknown };
	self?: unknown;
	WorkerGlobalScope?: unknown;
}

export function isNodeScope(scope: object): boolean {
	const { process } = scope as RuntimeScope;
	// The tag rules out polyfills such as process/browser, which are plain objects and
	// may fake versions.node; getBuiltinModule is the capability the library relies on.
	return (
		Object.prototype.toString.call(process) === "[object process]" &&
		typeof process?.getBuiltinModule === "function"
	);
}

export function hasDocument(scope: object): boolean {
	return (scope as RuntimeScope).window?.document !== undefined;
}

export function isWorkerScope(scope: object): boolean {
	const { self, WorkerGlobalScope } = scope as RuntimeScope;
	// Not `self` alone: Deno and edge runtimes define it without being web workers.
	return typeof WorkerGlobalScope === "function" && self instanceof WorkerGlobalScope;
}

export const isNode = /* @__PURE__ */ isNodeScope(globalThis);
export const isMainBrowser = /* @__PURE__ */ hasDocument(globalThis);
export const isWebWorker = !isNode && /* @__PURE__ */ isWorkerScope(globalThis);
export const isBrowser = isMainBrowser || isWebWorker;
```

`src/env/node-builtin.ts`:

```ts
interface NodeProcess {
	getBuiltinModule?: (id: string) => unknown;
}

// Not a dynamic import(): rspack strips `webpackIgnore` from it at build time, after
// which webpack 5 warns "Critical dependency: the request of a dependency is an
// expression" in every consumer build. getBuiltinModule leaves bundlers nothing to
// resolve.
export function getNodeBuiltin<T>(name: string, scope: object = globalThis): T | undefined {
	const { process } = scope as { process?: NodeProcess };
	return process?.getBuiltinModule?.(`node:${name}`) as T | undefined;
}
```

`src/index.ts`:

```ts
import { isMainBrowser, isNode, isWebWorker } from "./env/detect";
import { getNodeBuiltin } from "./env/node-builtin";

export { isBrowser, isMainBrowser, isNode, isWebWorker } from "./env/detect";

interface NodeOs {
	platform(): string;
}

export function describeRuntime(): string {
	if (isNode) return `node:${getNodeBuiltin<NodeOs>("os")?.platform() ?? "unknown"}`;
	if (isMainBrowser) return "browser";
	if (isWebWorker) return "worker";
	return "unknown";
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 19 tests in project `node`, 19 in project `browser`.

- [ ] **Step 9: Verify the typecheck, including the Node-global guard**

Run: `pnpm typecheck`
Expected: exit 0.

Then prove the guard: create `src/leak.ts` containing `export const leak = process.version;`, run `pnpm typecheck`.
Expected: FAIL with `src/leak.ts(1,21): error TS2591: Cannot find name 'process'`. Delete `src/leak.ts` and re-run `pnpm typecheck` (exit 0).

- [ ] **Step 10: Format, lint, commit**

```bash
pnpm exec biome check --write src tests tsconfig.json tsconfig.build.json rstest.config.ts package.json
pnpm exec biome ci
git add src tests tsconfig.json tsconfig.build.json rstest.config.ts package.json pnpm-lock.yaml
git commit -F - <<'EOF'
feat(env): detect the runtime environment and reach node built-ins safely

The logger adapts to where it runs, so detection and built-in access come
first. The flags are computed once at load so hot paths pay nothing, and
they reject process polyfills, which would otherwise pass for Node. Unit tests run in both Node and Chromium; the typecheck runs src/
alone as well, because test tooling types would otherwise hide a Node
global slipping into the universal code.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Build and npm package manifest

**Files:**
- Create: `rslib.config.ts`, `CHANGELOG.md`
- Modify: `package.json` (npm fields, scripts, devDependencies)

**Interfaces:**
- Consumes: `tsconfig.build.json`, `src/index.ts` from Task 1.
- Produces: `pnpm build` → `dist/index.js`, `dist/index.d.ts`, `dist/env/detect.d.ts`, `dist/env/node-builtin.d.ts`; `pnpm lint:package`; the npm-facing `package.json` that `pnpm pack` turns into the tarball Tasks 3–5 consume.

- [ ] **Step 1: Install the build and package-lint dependencies**

```bash
pnpm add -D @rslib/core@^1.0.2 publint@^0.3.24 @arethetypeswrong/cli@^0.18.5
```

Same rule as Task 1 Step 1 for ignored build scripts.

- [ ] **Step 2: Create the rslib config**

`rslib.config.ts`:

```ts
import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [{ format: "esm", syntax: "es2022", bundle: true, dts: true }],
	source: { tsconfigPath: "./tsconfig.build.json" },
	output: { target: "web" },
});
```

- [ ] **Step 3: Write the npm-facing package.json**

Edit `package.json` so it reads exactly as follows, keeping the `devDependencies` versions pnpm wrote (shown here as resolved at plan time):

```json
{
	"name": "lololog",
	"version": "0.0.1",
	"description": "Universal logger: log everywhere with style and low overhead",
	"keywords": [
		"logger",
		"logging",
		"log",
		"universal",
		"isomorphic",
		"browser",
		"node",
		"typescript",
		"esm"
	],
	"homepage": "https://github.com/lalexdotcom/lololog#readme",
	"bugs": "https://github.com/lalexdotcom/lololog/issues",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/lalexdotcom/lololog.git"
	},
	"license": "MIT",
	"author": {
		"name": "Alexandre LEGOUT",
		"url": "https://github.com/lalexdotcom"
	},
	"type": "module",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		}
	},
	"types": "./dist/index.d.ts",
	"files": ["dist"],
	"sideEffects": false,
	"engines": {
		"node": ">=22.3.0"
	},
	"publishConfig": {
		"access": "public",
		"provenance": true
	},
	"scripts": {
		"build": "rslib build",
		"dev": "rslib build --watch",
		"typecheck": "tsc --noEmit -p tsconfig.build.json && tsc --noEmit",
		"lint": "biome check",
		"lint:package": "publint && attw --pack . --profile esm-only",
		"test": "rstest run"
	},
	"devDependencies": {
		"@arethetypeswrong/cli": "^0.18.5",
		"@biomejs/biome": "^2.5.11",
		"@rslib/core": "^1.0.2",
		"@rstest/browser": "^0.12.1",
		"@rstest/core": "^0.12.1",
		"@types/node": "^22.20.4",
		"playwright": "^1.62.1",
		"publint": "^0.3.24",
		"tsx": "^4.23.13",
		"typescript": "^7.0.2"
	},
	"packageManager": "pnpm@12.6.0"
}
```

- [ ] **Step 4: Create the changelog**

`CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

- [ ] **Step 5: Build and check the output layout**

Run: `pnpm build && find dist -type f | sort && grep -c 'import(' dist/index.js`
Expected: build succeeds, with `declaration files generated with tsgo` in its output; the file list is exactly

```
dist/env/detect.d.ts
dist/env/node-builtin.d.ts
dist/index.d.ts
dist/index.js
```

and the `grep -c` prints `0`.

- [ ] **Step 6: Lint the package**

Run: `pnpm lint:package`
Expected: publint prints `All good!`; attw shows 🟢 for `node16 (from ESM)` and `bundler`, the two other rows `(ignored)`; exit 0.

- [ ] **Step 7: Format, lint, commit**

```bash
pnpm exec biome check --write rslib.config.ts package.json
pnpm exec biome ci
git add rslib.config.ts CHANGELOG.md package.json pnpm-lock.yaml
git commit -F - <<'EOF'
build: bundle with rslib and describe the package for npm

One ESM bundle with its declarations, the npm fields publication and
provenance rely on, and publint plus attw to catch packaging mistakes
that only a consumer would otherwise hit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Consumer fixtures, browser harness, local runner

**Files:**
- Create: `tests/consumers/run-in-browser.mjs`
- Create: `tests/consumers/node/{package.json,tsconfig.json,index.mjs}`
- Create: `tests/consumers/rsbuild/{package.json,build.mjs,src/index.js}`
- Create: `tests/consumers/rspack/{package.json,build.mjs,src/index.js}`
- Create: `tests/consumers/webpack/{package.json,build.mjs,src/index.js}`
- Create: `tests/consumers/vite/{package.json,tsconfig.json,vite.config.js,index.html,src/main.ts}`
- Create: `scripts/test-consumers.ts`
- Modify: `package.json` (`scripts.test:consumers`)

**Interfaces:**
- Consumes: `pnpm build`, `pnpm pack`, and the public API `isNode`, `describeRuntime` of package `lololog` (Tasks 1–2).
- Produces (Task 4's CI relies on these exact names):
  - Fixture contract: each `tests/consumers/<name>/` has `npm run check`, exiting non-zero on any failure. Browser fixtures build into `dist/` with a `dist/index.html` whose bundle sets `window.__result`.
  - Fixture list: `node` (no browser run), `rsbuild`, `rspack`, `webpack`, `vite` (browser run).
  - `node tests/consumers/run-in-browser.mjs <dist-dir> <expected>` — exit 0 when `window.__result === expected` with no page or console error.
  - `pnpm test:consumers [fixture...]`.

- [ ] **Step 1: Write the browser harness**

`tests/consumers/run-in-browser.mjs`:

```js
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const [dir, expected] = process.argv.slice(2);
if (!dir || !expected) {
	console.error("usage: run-in-browser.mjs <dist-dir> <expected-result>");
	process.exit(2);
}

const root = resolve(dir);
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
	const path = new URL(req.url ?? "/", "http://localhost").pathname;
	const file = normalize(join(root, path === "/" ? "index.html" : path));
	if (!file.startsWith(root + sep)) {
		res.writeHead(403).end();
		return;
	}
	try {
		const body = await readFile(file);
		const type = contentTypes[extname(file)] ?? "application/octet-stream";
		res.writeHead(200, { "content-type": type }).end(body);
	} catch {
		res.writeHead(404).end();
	}
});
await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
const { port } = server.address();

const browser = await chromium.launch();
const errors = [];
try {
	const page = await browser.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto(`http://127.0.0.1:${port}/`);
	const result = await page
		.waitForFunction(() => window.__result, null, { timeout: 5000 })
		.then((handle) => handle.jsonValue())
		.catch(() => undefined);
	if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);
	if (result !== expected) {
		throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`);
	}
	console.log(`ok: ${result}`);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await browser.close();
	server.close();
}
```

- [ ] **Step 2: Write the node fixture**

`tests/consumers/node/package.json`:

```json
{
	"name": "consumer-node",
	"private": true,
	"type": "module",
	"scripts": {
		"check": "tsc && node index.mjs"
	},
	"devDependencies": {
		"@types/node": "^22.20.4",
		"typescript": "^7.0.2"
	}
}
```

`tests/consumers/node/tsconfig.json`:

```json
{
	"compilerOptions": {
		"strict": true,
		"target": "es2022",
		"module": "nodenext",
		"moduleResolution": "nodenext",
		"types": ["node"],
		"allowJs": true,
		"checkJs": true,
		"noEmit": true
	},
	"include": ["index.mjs"]
}
```

`tests/consumers/node/index.mjs`:

```js
import { describeRuntime, isBrowser, isNode } from "lololog";

if (!isNode || isBrowser) throw new Error(`expected Node only, got isNode=${isNode} isBrowser=${isBrowser}`);

const runtime = describeRuntime();
if (!/^node:\w+$/.test(runtime) || runtime === "node:unknown") {
	throw new Error(`expected node:<platform>, got ${runtime}`);
}
console.log(`ok: ${runtime}`);
```

- [ ] **Step 3: Write the rsbuild fixture**

`tests/consumers/rsbuild/package.json`:

```json
{
	"name": "consumer-rsbuild",
	"private": true,
	"type": "module",
	"scripts": {
		"check": "node build.mjs"
	},
	"devDependencies": {
		"@rsbuild/core": "^2.2.9"
	}
}
```

`tests/consumers/rsbuild/build.mjs`:

```js
import { createRsbuild } from "@rsbuild/core";

const rsbuild = await createRsbuild({
	cwd: import.meta.dirname,
	rsbuildConfig: { source: { entry: { index: "./src/index.js" } } },
});
rsbuild.onAfterBuild(({ stats }) => {
	if (stats?.hasWarnings()) {
		console.error("rsbuild emitted warnings");
		process.exitCode = 1;
	}
});
await rsbuild.build();
```

`tests/consumers/rsbuild/src/index.js`:

```js
import { describeRuntime } from "lololog";

window.__result = describeRuntime();
```

- [ ] **Step 4: Write the rspack fixture**

`tests/consumers/rspack/package.json`:

```json
{
	"name": "consumer-rspack",
	"private": true,
	"type": "module",
	"scripts": {
		"check": "node build.mjs"
	},
	"devDependencies": {
		"@rspack/core": "^2.2.7"
	}
}
```

`tests/consumers/rspack/build.mjs`:

```js
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { rspack } from "@rspack/core";

const dist = join(import.meta.dirname, "dist");
const compiler = rspack({
	mode: "production",
	target: "web",
	context: import.meta.dirname,
	entry: "./src/index.js",
	output: { path: dist },
});
compiler.run((error, stats) => {
	if (error) throw error;
	console.log(stats.toString({ colors: false, all: false, errors: true, warnings: true }));
	if (stats.hasErrors() || stats.hasWarnings()) {
		process.exitCode = 1;
		return;
	}
	// rspack emits no HTML page; the browser harness loads dist/index.html.
	writeFileSync(join(dist, "index.html"), '<!doctype html><script src="main.js"></script>\n');
});
```

`tests/consumers/rspack/src/index.js`:

```js
import { describeRuntime } from "lololog";

window.__result = describeRuntime();
```

- [ ] **Step 5: Write the webpack fixture**

`tests/consumers/webpack/package.json`:

```json
{
	"name": "consumer-webpack",
	"private": true,
	"type": "module",
	"scripts": {
		"check": "node build.mjs"
	},
	"devDependencies": {
		"webpack": "^5.111.1"
	}
}
```

`tests/consumers/webpack/build.mjs`:

```js
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import webpack from "webpack";

const dist = join(import.meta.dirname, "dist");
const compiler = webpack({
	mode: "production",
	target: "web",
	context: import.meta.dirname,
	entry: "./src/index.js",
	output: { path: dist },
});
compiler.run((error, stats) => {
	if (error) throw error;
	console.log(stats.toString({ colors: false, all: false, errors: true, warnings: true }));
	if (stats.hasErrors() || stats.hasWarnings()) {
		process.exitCode = 1;
		return;
	}
	// webpack emits no HTML page; the browser harness loads dist/index.html.
	writeFileSync(join(dist, "index.html"), '<!doctype html><script src="main.js"></script>\n');
});
```

`tests/consumers/webpack/src/index.js`:

```js
import { describeRuntime } from "lololog";

window.__result = describeRuntime();
```

- [ ] **Step 6: Write the vite fixture**

`tests/consumers/vite/package.json`:

```json
{
	"name": "consumer-vite",
	"private": true,
	"type": "module",
	"scripts": {
		"check": "tsc && vite build"
	},
	"devDependencies": {
		"typescript": "^7.0.2",
		"vite": "^8.3.1"
	}
}
```

`tests/consumers/vite/tsconfig.json`:

```json
{
	"compilerOptions": {
		"strict": true,
		"target": "es2022",
		"module": "esnext",
		"moduleResolution": "bundler",
		"lib": ["es2022", "dom"],
		"types": [],
		"noEmit": true
	},
	"include": ["src"]
}
```

`tests/consumers/vite/vite.config.js`:

```js
export default {
	build: {
		rolldownOptions: {
			// Vite only prints warnings; a consumer build of lololog must have none.
			onwarn(warning) {
				throw new Error(`vite warning: ${warning.message}`);
			},
		},
	},
};
```

`tests/consumers/vite/index.html`:

```html
<!doctype html>
<script type="module" src="/src/main.ts"></script>
```

`tests/consumers/vite/src/main.ts`:

```ts
import { describeRuntime } from "lololog";

declare global {
	interface Window {
		__result?: string;
	}
}

window.__result = describeRuntime();
```

- [ ] **Step 7: Write the local runner**

`scripts/test-consumers.ts`:

```ts
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Mirrors the `consumers` job matrix in .github/workflows/ci.yml.
const fixtures = [
	{ name: "node", browser: false },
	{ name: "rsbuild", browser: true },
	{ name: "rspack", browser: true },
	{ name: "webpack", browser: true },
	{ name: "vite", browser: true },
];

const root = resolve(import.meta.dirname, "..");
const only = process.argv.slice(2);
const selected = fixtures.filter(({ name }) => only.length === 0 || only.includes(name));

function run(command: string, args: string[], cwd: string): void {
	execFileSync(command, args, { cwd, stdio: "inherit" });
}

const work = mkdtempSync(join(tmpdir(), "lololog-consumers-"));
try {
	run("pnpm", ["build"], root);
	run("pnpm", ["pack", "--pack-destination", work], root);
	const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"));
	if (!tarball) throw new Error(`pnpm pack wrote no tarball in ${work}`);

	const failed: string[] = [];
	for (const { name, browser } of selected) {
		const dir = join(work, name);
		cpSync(join(root, "tests/consumers", name), dir, {
			recursive: true,
			filter: (source) => !["node_modules", "dist"].includes(basename(source)),
		});
		try {
			run("npm", ["install", "--no-audit", "--no-fund"], dir);
			run("npm", ["install", "--no-audit", "--no-fund", join(work, tarball)], dir);
			run("npm", ["run", "check"], dir);
			if (browser) {
				run("node", ["tests/consumers/run-in-browser.mjs", join(dir, "dist"), "browser"], root);
			}
			console.log(`✓ ${name}`);
		} catch {
			failed.push(name);
			console.error(`✗ ${name}`);
		}
	}
	if (failed.length > 0) {
		console.error(`failed: ${failed.join(", ")}`);
		process.exitCode = 1;
	}
} finally {
	rmSync(work, { recursive: true, force: true });
}
```

In `package.json` `"scripts"`, add after `"test"`:

```json
"test:consumers": "tsx scripts/test-consumers.ts"
```

- [ ] **Step 8: Run every fixture**

Run: `pnpm test:consumers`
Expected: `✓ node`, `✓ rsbuild`, `✓ rspack`, `✓ webpack`, `✓ vite`; each browser fixture also prints `ok: browser`, the node fixture `ok: node:linux`; exit 0.

- [ ] **Step 9: Prove the fixtures catch a Node built-in leaking into the bundle**

Temporarily add `import { platform } from "node:os";` at the top of `src/env/node-builtin.ts` and make `getNodeBuiltin` return `{ platform } as T` (Serena `replace_symbol_body`). Run `pnpm test:consumers webpack rspack`.
Expected: `✗ webpack` and `✗ rspack` (build error on `node:os` for a web target); exit 1. Then run `pnpm typecheck`.
Expected: FAIL with `Cannot find module 'node:os'` from the src-only pass — this is the guard that also covers vite, which silently stubs `node:*` in a browser build. Restore with `git checkout src/env/node-builtin.ts`, then `pnpm test:consumers webpack rspack` and `pnpm typecheck`: both green.

- [ ] **Step 10: Check the root typecheck and tests still ignore the fixtures**

Run: `pnpm typecheck && pnpm test`
Expected: exit 0; rstest collects only `tests/*.test.ts` (38 tests), nothing under `tests/consumers/`.

- [ ] **Step 11: Format, lint, commit**

```bash
pnpm exec biome check --write tests/consumers scripts package.json
pnpm exec biome ci
git add tests/consumers scripts/test-consumers.ts package.json
git commit -F - <<'EOF'
test(consumers): build the packed package with node and four bundlers

A universal package breaks at the consumer's bundler, not in its own
tests. Each fixture installs the real tarball with npm, fails on any
bundler warning, and runs the bundle in Chromium to confirm the browser
branch is the one taken.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm typecheck`, `pnpm build`, `pnpm lint:package`, rstest projects `node` / `browser` (Task 1–2); fixture contract, fixture list and `tests/consumers/run-in-browser.mjs` (Task 3).
- Produces: a workflow callable with `uses: ./.github/workflows/ci.yml` (Task 5), uploading artifact `package` (the tarball).

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_call:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec biome ci
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm lint:package
      - run: pnpm pack --pack-destination "$RUNNER_TEMP/package"
      - uses: actions/upload-artifact@v7
        with:
          name: package
          path: ${{ runner.temp }}/package/*.tgz
          if-no-files-found: error

  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [22, 24]
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec rstest run --project node
      # The browser result does not depend on the Node version running the tests.
      - if: matrix.node == 24
        run: pnpm exec playwright install --with-deps chromium
      - if: matrix.node == 24
        run: pnpm exec rstest run --project browser

  consumers:
    needs: check
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      # Mirrored by the fixture list in scripts/test-consumers.ts.
      matrix:
        include:
          - fixture: node
            browser: false
          - fixture: rsbuild
            browser: true
          - fixture: rspack
            browser: true
          - fixture: webpack
            browser: true
          - fixture: vite
            browser: true
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      # The repo's own install only provides Playwright for the browser harness.
      - run: pnpm install --frozen-lockfile
      - uses: actions/download-artifact@v8
        with:
          name: package
          path: ${{ runner.temp }}/package
      - name: Install the packed package into the fixture
        env:
          FIXTURE: ${{ matrix.fixture }}
        run: |
          work="$RUNNER_TEMP/consumer"
          cp -R "tests/consumers/$FIXTURE" "$work"
          cd "$work"
          npm install --no-audit --no-fund
          npm install --no-audit --no-fund "$RUNNER_TEMP"/package/*.tgz
      - run: npm run check
        working-directory: ${{ runner.temp }}/consumer
      - if: matrix.browser
        run: pnpm exec playwright install --with-deps chromium
      - if: matrix.browser
        run: node tests/consumers/run-in-browser.mjs "$RUNNER_TEMP/consumer/dist" browser
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output, exit 0 (ShellCheck included, it is installed in the devcontainer).

- [ ] **Step 3: Replay the `check` and `test` jobs locally**

Run: `pnpm install --frozen-lockfile && pnpm exec biome ci && pnpm typecheck && pnpm build && pnpm lint:package && pnpm exec rstest run --project node && pnpm exec rstest run --project browser`
Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
pnpm exec biome ci
git add .github/workflows/ci.yml
git commit -F - <<'EOF'
ci: lint, typecheck, test and consume the package on every change

Node tests run on both supported majors; browser tests and consumer
builds run once, against the tarball the check job packed, so CI tests
exactly what would be published. The workflow is callable so the
release can require it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `.github/workflows/ci.yml` via `workflow_call` (Task 4); `CHANGELOG.md` format (Task 2).
- Produces: a tag-triggered release that publishes to npm with provenance and creates the GitHub Release, whose body is the tag's CHANGELOG section followed by GitHub's generated notes.

- [ ] **Step 1: Write the workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*"
      - "v*.*.*-*"

permissions:
  contents: read

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  release:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write
      # npm provenance signs with the job's OIDC token.
      id-token: write
    steps:
      - uses: actions/checkout@v7
      - name: Extract the release notes from CHANGELOG.md
        id: notes
        run: |
          version="${GITHUB_REF_NAME#v}"
          notes="$RUNNER_TEMP/release-notes.md"
          # index(), not a regex: the dots of the version must match literally, and
          # "## [1.0.0]" must not match the tag v1.0.0-beta.1.
          awk -v v="$version" '
            /^## \[/ { if (found) exit; found = index($0, "## [" v "]") == 1; next }
            found { print }
          ' CHANGELOG.md > "$notes"
          if ! grep -q '[^[:space:]]' "$notes"; then
            echo "::error file=CHANGELOG.md::No non-empty \"## [$version]\" section"
            exit 1
          fi
          echo "file=$notes" >> "$GITHUB_OUTPUT"
      - uses: lalexdotcom/action-release-and-publish@v3
        with:
          publish: true
          npm-token: ${{ secrets.NPM_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          release-notes-file: ${{ steps.notes.outputs.file }}
          node-version: lts/*
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint`
Expected: no output, exit 0, for both workflows.

- [ ] **Step 3: Test the extraction against the edge cases**

In the session scratchpad (not the repo), create `CHANGELOG.md`:

```markdown
# Changelog

## [Unreleased]

## [1.0.0-beta.1] - 2026-10-02

### Added

- Beta entry.

## [1.0.0] - 2026-10-01

### Added

- Stable entry.

## [0.9.0] - 2026-09-30
```

Copy the `run:` block of the extraction step into `extract.sh` there, and run it per tag with `GITHUB_REF_NAME=<tag> RUNNER_TEMP=. GITHUB_OUTPUT=/dev/null bash extract.sh; echo "exit=$?"; cat release-notes.md`:

| Tag | Expected |
|---|---|
| `v1.0.0` | exit 0; notes contain `- Stable entry.` and not `Beta` |
| `v1.0.0-beta.1` | exit 0; notes contain `- Beta entry.` and not `Stable` |
| `v0.9.0` | exit 1; `::error` about an empty section |
| `v2.0.0` | exit 1; `::error` about a missing section |

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -F - <<'EOF'
ci: publish tagged versions with their changelog section

A tag only publishes once the full CI passed on it. The release body
starts with the CHANGELOG section of that exact version, and a tag
without one fails before anything reaches npm.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Serena memories

**Files:**
- Create (through Serena `write_memory`, never with Write): `.serena/memories/project/overview.md`, `project/stack.md`, `conventions/code-style.md`, `conventions/workflow.md`, `conventions/testing.md`, `conventions/changelog.md`, `conventions/release.md`

**Interfaces:**
- Consumes: the state produced by Tasks 1–5 (read the files to confirm every statement below still holds before writing it).
- Produces: the memories later sessions read.

- [ ] **Step 1: Write the memories**

Call `mcp__serena__write_memory` once per memory, with these names and contents. Do not repeat anything AGENTS.md already says.

`project/overview`:

```markdown
# lololog — overview

Universal TypeScript logger for browser and Node.js. npm description:
"Universal logger: log everywhere with style and low overhead". Two product
goals drive every design choice: low overhead and a pleasant look.

- ESM only (no CJS, no UMD); Node >= 22.3.0.
- One bundle for every environment. `src/env/detect.ts` exports module-level
  flags `isNode`, `isMainBrowser`, `isWebWorker`, `isBrowser`, computed once at
  load; they are not exclusive (jsdom and Electron renderers are both Node and
  main browser). `isNode` requires the native `[object process]` tag and
  `process.getBuiltinModule`, so a `process` polyfill never passes for Node;
  `isWebWorker` requires `self instanceof WorkerGlobalScope`, since Deno and
  edge runtimes define `self` too.
- Node built-ins are reached only through `src/env/node-builtin.ts`
  `getNodeBuiltin(name)`, on `process.getBuiltinModule` (sync, Node 22.3+). Never
  `import("node:…")`: rspack strips `webpackIgnore` from it at build time, and
  webpack 5 then warns "Critical dependency" in every consumer build.
- `src/` must not reference a Node global; `pnpm typecheck` enforces it through
  `tsconfig.build.json` (src alone, `types: []`).
```

`project/stack`:

```markdown
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
```

`conventions/code-style`:

```markdown
# Code style

- Imports are relative and extensionless (`from "./env/detect"`); no path
  aliases. `moduleResolution: "bundler"` and the rslib bundle make that work.
```

`conventions/workflow`:

```markdown
# Workflow

- Every piece of work happens on a feat-branch, opened before its spec is
  committed; the spec is committed on that branch.
- Implementation runs in subagent mode by default
  (`superpowers:subagent-driven-development`); inline only on request.
- Before delivering a branch: `pnpm exec biome ci`, `pnpm typecheck`,
  `pnpm build`, `pnpm lint:package`, `pnpm test`, `pnpm test:consumers` all
  green.
- After the merge: update these Serena memories to match what shipped.
```

`conventions/testing`:

```markdown
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
```

`conventions/changelog`:

```markdown
# Changelog

- `CHANGELOG.md` follows Keep a Changelog 1.1.0: sections `Added`, `Changed`,
  `Deprecated`, `Removed`, `Fixed`, `Security` under `## [Unreleased]`.
- Every user-visible change adds its entry under `[Unreleased]` in the same
  commit as the change.
- Preparing a delivery (on request): rename `## [Unreleased]` to
  `## [x.y.z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it.
  The release fails if the tag's section is missing or empty.
```

`conventions/release`:

```markdown
# Release

- Version bump, tag and push belong to the user, through `npx upversion`
  (interactive; it commits, tags and pushes). The agent never bumps, tags or
  pushes.
- A `vX.Y.Z` or `vX.Y.Z-pre` tag triggers `.github/workflows/release.yml`: the
  full CI runs first, then the tag's CHANGELOG section becomes the GitHub
  Release body (GitHub's generated notes appended), and
  `lalexdotcom/action-release-and-publish@v3` publishes to npm with provenance.
- Requires the `NPM_TOKEN` repository secret.
```

- [ ] **Step 2: Verify**

Run: `mcp__serena__list_memories`
Expected: the seven memories above are listed.

- [ ] **Step 3: Commit**

```bash
git add .serena/memories
git commit -F - <<'EOF'
docs(memory): record the project stack and conventions

Later sessions start from these rather than rediscovering them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
