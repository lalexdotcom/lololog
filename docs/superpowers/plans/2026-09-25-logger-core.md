# Logger Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `import { L } from "lololog"`: a `console.log`-like logger with 11 OTel-mapped levels, root/scope loggers, and five renderers (browser, TTY, pretty, json, logfmt).

**Architecture:** Pure units (levels and colours, safe JSON, message extraction, one renderer per output, renderer selection) under a thin stateful layer: `src/logger.ts` holds the root and scope loggers, filters each call, builds one record and hands it to the renderer the root selected, whose output goes to `console.log` and nowhere else. `src/index.ts` keeps one root per realm under `Symbol.for("lololog")`.

**Tech Stack:** TypeScript 7 (tsgo), rslib, rstest 0.12 (`node` + `browser` projects), Biome 2.5, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-09-25-logger-core-design.md`

## Global Constraints

- Every output goes through `console.log` only: no `console.warn`/`console.error`, no `stream.write`.
- A call below the threshold costs two boolean checks and two comparisons, nothing else.
- `src/` references no Node global and imports no `node:*` module; Node built-ins come from `getNodeBuiltin` (`src/env/node-builtin.ts`). `pnpm typecheck` enforces it through `tsconfig.build.json`.
- Imports are relative and extensionless (`from "./levels"`); no path aliases.
- Every test file runs in both rstest projects, `node` and `browser`; nothing in a test may depend on the runtime unless it branches on `typeof window === "undefined"`.
- Formatting: Biome, tabs, line width 100. Run `pnpm exec biome check --write <files>` after every modification, then `pnpm exec biome check` must be clean.
- Comments say why, never what (AGENTS.md § Comments). Keep the ones given in this plan; add none that restate code.
- Code files are read and edited through Serena's symbolic tools (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, `replace_content`, `insert_after_symbol`, `safe_delete_symbol`, …), and `get_diagnostics_for_file` after an edit; built-in Read/Edit only for non-code files (JSON, YAML, Markdown) or when Serena fails. New files may be created with Write. Every subagent prompt that touches code carries this rule.
- Commits: Conventional Commits, the body explains why, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bump the version, tag or push.
- Work happens on branch `feat/logger-core` (already checked out), in the main checkout. Never create or use a git worktree: it disrupts the tooling, Serena first.
- Subagent tiers (AGENTS.md § Model & Effort Policy): each task names its tier; cheap = `haiku`/`low`, standard = `sonnet`/`medium`, capable = `opus`/`high`. Reviewers are standard at least; the final whole-branch review is capable.

## Review Focus

- A scope name with a space or a quote under `logfmt` (`L.scope("my db")`): the value must be quoted, `scope="my db"`, or collectors split the line. Pinned in Task 6.
- A scope created before the root's `format` changes: it must write through the root's new renderer, not the one current at its creation. Pinned in Task 8.
- An argument whose getter throws, logged in `json`: the call must not throw, and the line carries `"[Unserializable]"`. Pinned in Task 8 (end to end) on top of Task 3 (unit).
- `L.info()` with no argument under `json`: one line with `"msg":""` and no `data`. Pinned in Task 6.
- A first argument with a lone `%` and extra arguments (`L.info("50% done", 1)`): `msg` stays `"50% done"`, since `"% "` is no specifier, and the `1` goes to `data`. Pinned in Task 4.

---

### Task 1: Levels and colours

**Tier:** cheap

**Files:**
- Create: `src/style/ansi.ts`
- Create: `src/levels.ts`
- Test: `tests/ansi.test.ts`, `tests/levels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/style/ansi.ts`: `STYLES`, `type Color`, `type BackgroundColor`, `interface Style { color?: Color; "background-color"?: BackgroundColor }`, `colorize(text: string, style: Style): string`.
  - `src/levels.ts`: `LEVELS` (as const), `type Level`, `LEVEL_NAMES: Level[]` (by increasing severity), `LEVEL_STYLES: Record<Level, Required<Style>>`, `isLevel(value: unknown): value is Level`.

- [ ] **Step 1: Write the failing tests**

`tests/ansi.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { colorize, STYLES } from "../src/style/ansi";

describe("colorize", () => {
	test("wraps text in a standard code and resets after it", () => {
		expect(colorize("x", { color: "red" })).toBe("\u001B[31mx\u001B[0m");
	});

	test("flattens extended codes and joins foreground and background in one sequence", () => {
		expect(colorize("x", { color: "white", "background-color": "orange" })).toBe(
			"\u001B[38;5;15;48;5;208mx\u001B[0m",
		);
	});

	test("leaves text untouched when the style names no color", () => {
		expect(colorize("x", {})).toBe("x");
	});
});

describe("STYLES", () => {
	test("provides lightgray as text and background", () => {
		expect(STYLES.color.lightgray).toEqual([38, 5, 252]);
		expect(STYLES["background-color"].lightgray).toEqual([48, 5, 252]);
	});
});
```

`tests/levels.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { isLevel, LEVEL_NAMES, LEVEL_STYLES, LEVELS } from "../src/levels";

describe("LEVELS", () => {
	test("carries the OpenTelemetry severity numbers", () => {
		expect(LEVELS).toEqual({
			wth: 1,
			debug: 5,
			verb: 8,
			info: 9,
			success: 10,
			notice: 11,
			warn: 13,
			error: 17,
			crit: 20,
			alert: 22,
			emerg: 24,
		});
	});

	test("lists the names by increasing severity", () => {
		const severities = LEVEL_NAMES.map((level) => LEVELS[level]);
		expect(severities).toEqual([...severities].sort((a, b) => a - b));
	});
});

describe("LEVEL_STYLES", () => {
	test("styles every level", () => {
		expect(Object.keys(LEVEL_STYLES)).toEqual(LEVEL_NAMES);
	});

	test("paints every error level white on red", () => {
		for (const level of ["error", "crit", "alert", "emerg"] as const) {
			expect(LEVEL_STYLES[level]).toEqual({ color: "white", "background-color": "red" });
		}
	});
});

describe("isLevel", () => {
	test("accepts the canonical keys", () => {
		for (const level of LEVEL_NAMES) expect(isLevel(level)).toBe(true);
	});

	test("rejects aliases, inherited keys, other cases and non-strings", () => {
		for (const value of ["warning", "toString", "INFO", 9, undefined]) {
			expect(isLevel(value)).toBe(false);
		}
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec rstest run tests/ansi.test.ts tests/levels.test.ts`
Expected: FAIL, the modules `../src/style/ansi` and `../src/levels` do not exist.

- [ ] **Step 3: Write the implementation**

`src/style/ansi.ts` (the user's existing palette, with `lightgray` added and the style typed strictly):

```ts
/**
 * A single number is a standard SGR code; an array is an extended 256-color sequence
 * (e.g. [38, 5, N]).
 */
type ColorRegistry = Record<string, number | number[]>;

// The names are CSS color names, so the browser renderer uses them as CSS values directly.
export const STYLES = {
	color: {
		black: 30,
		grey: 90,
		lightgray: [38, 5, 252],
		white: [38, 5, 15],

		red: 31,
		green: 32,
		yellow: 93,
		orange: 33,
		blue: 94,
		dodgerblue: [38, 5, 33],
		cyan: 36,
		mediumpurple: [38, 5, 135],
	},
	"background-color": {
		black: 40,
		grey: [48, 5, 249],
		lightgray: [48, 5, 252],
		white: 107,

		red: [48, 5, 160],
		green: [48, 5, 40],
		yellow: [48, 5, 226],
		orange: [48, 5, 208],
		blue: [48, 5, 21],
		dodgerblue: [48, 5, 33],
		cyan: 46,
		mediumpurple: [48, 5, 135],
	},
} satisfies { color: ColorRegistry; "background-color": ColorRegistry };

export type Color = keyof (typeof STYLES)["color"];
export type BackgroundColor = keyof (typeof STYLES)["background-color"];

export interface Style {
	color?: Color;
	"background-color"?: BackgroundColor;
}

export function colorize(text: string, style: Style): string {
	const codes: number[] = [];
	if (style.color) codes.push(...[STYLES.color[style.color]].flat());
	if (style["background-color"]) {
		codes.push(...[STYLES["background-color"][style["background-color"]]].flat());
	}
	return codes.length > 0 ? `\u001B[${codes.join(";")}m${text}\u001B[0m` : text;
}
```

`src/levels.ts`:

```ts
import type { Style } from "./style/ansi";

export const LEVELS = {
	wth: 1,
	debug: 5,
	verb: 8,
	info: 9,
	success: 10,
	notice: 11,
	warn: 13,
	error: 17,
	crit: 20,
	alert: 22,
	emerg: 24,
} as const;

export type Level = keyof typeof LEVELS;

export const LEVEL_NAMES = Object.keys(LEVELS) as Level[];

export const LEVEL_STYLES = {
	wth: { color: "black", "background-color": "lightgray" },
	debug: { color: "black", "background-color": "yellow" },
	verb: { color: "white", "background-color": "mediumpurple" },
	info: { color: "white", "background-color": "grey" },
	success: { color: "white", "background-color": "green" },
	notice: { color: "white", "background-color": "blue" },
	warn: { color: "white", "background-color": "orange" },
	error: { color: "white", "background-color": "red" },
	crit: { color: "white", "background-color": "red" },
	alert: { color: "white", "background-color": "red" },
	emerg: { color: "white", "background-color": "red" },
} as const satisfies Record<Level, Required<Style>>;

export function isLevel(value: unknown): value is Level {
	return typeof value === "string" && Object.hasOwn(LEVELS, value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec rstest run tests/ansi.test.ts tests/levels.test.ts`
Expected: PASS in both `node` and `browser` projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/style src/levels.ts tests/ansi.test.ts tests/levels.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/style/ansi.ts src/levels.ts tests/ansi.test.ts tests/levels.test.ts
git commit -m "feat(levels): define the OTel-mapped levels and their colours

The severity numbers are OpenTelemetry's, so a record maps onto an OTel log
without a lookup table; the colour names are CSS names so one table serves the
ANSI and the browser output.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Terminal and NO_COLOR detection

**Tier:** cheap

**Files:**
- Create: `src/env/tty.ts`
- Test: `tests/tty.test.ts`

**Interfaces:**
- Consumes: `getNodeBuiltin<T>(name: string, scope?: object): T | undefined` from `src/env/node-builtin.ts` (existing).
- Produces: `stdoutIsTTY(scope: object): boolean`, `noColorRequested(scope: object): boolean`, and the load-time flags `isTTY: boolean`, `noColor: boolean`.

- [ ] **Step 1: Write the failing test**

`tests/tty.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { isTTY, noColor, noColorRequested, stdoutIsTTY } from "../src/env/tty";

function withProcess(process: object): object {
	return {
		process: { getBuiltinModule: (id: string) => (id === "node:process" ? process : undefined) },
	};
}

describe("stdoutIsTTY", () => {
	test("reads stdout.isTTY from the node:process built-in", () => {
		expect(stdoutIsTTY(withProcess({ stdout: { isTTY: true } }))).toBe(true);
		expect(stdoutIsTTY(withProcess({ stdout: {} }))).toBe(false);
	});

	test("is false without a Node process", () => {
		expect(stdoutIsTTY({})).toBe(false);
		expect(stdoutIsTTY({ process: { env: {}, browser: true } })).toBe(false);
	});
});

describe("noColorRequested", () => {
	test("is true when NO_COLOR is set to a non-empty value", () => {
		expect(noColorRequested(withProcess({ env: { NO_COLOR: "1" } }))).toBe(true);
	});

	test("is false when NO_COLOR is empty or unset", () => {
		expect(noColorRequested(withProcess({ env: { NO_COLOR: "" } }))).toBe(false);
		expect(noColorRequested(withProcess({ env: {} }))).toBe(false);
	});

	test("is false without a Node process", () => {
		expect(noColorRequested({})).toBe(false);
	});
});

describe("flags", () => {
	test("are false in the browser", () => {
		if (typeof window !== "undefined") {
			expect(isTTY).toBe(false);
			expect(noColor).toBe(false);
		} else {
			expect(typeof isTTY).toBe("boolean");
			expect(typeof noColor).toBe("boolean");
		}
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/tty.test.ts`
Expected: FAIL, module `../src/env/tty` not found.

- [ ] **Step 3: Write the implementation**

`src/env/tty.ts`:

```ts
import { getNodeBuiltin } from "./node-builtin";

interface NodeProcessIo {
	stdout?: { isTTY?: boolean };
	env?: Record<string, string | undefined>;
}

export function stdoutIsTTY(scope: object): boolean {
	return getNodeBuiltin<NodeProcessIo>("process", scope)?.stdout?.isTTY === true;
}

// no-color.org: set and not empty. An empty NO_COLOR= is how a user unsets it in a shell
// where it was exported.
export function noColorRequested(scope: object): boolean {
	const value = getNodeBuiltin<NodeProcessIo>("process", scope)?.env?.NO_COLOR;
	return value !== undefined && value !== "";
}

export const isTTY = /* @__PURE__ */ stdoutIsTTY(globalThis);
export const noColor = /* @__PURE__ */ noColorRequested(globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/tty.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/env/tty.ts tests/tty.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/env/tty.ts tests/tty.test.ts
git commit -m "feat(env): detect a terminal stdout and NO_COLOR

Read once at load through getNodeBuiltin, so src/ still references no Node
global and browser bundles see nothing to resolve.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Safe serialisation

**Tier:** cheap

**Files:**
- Create: `src/format/serialize.ts`
- Test: `tests/serialize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `serialize(value: unknown): string`. It never throws; it returns `"undefined"` where `JSON.stringify` returns nothing.

- [ ] **Step 1: Write the failing test**

`tests/serialize.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { serialize } from "../src/format/serialize";

describe("serialize", () => {
	test("writes plain values as JSON", () => {
		expect(serialize({ a: [1, "b", null, true] })).toBe('{"a":[1,"b",null,true]}');
	});

	test("writes an Error with its name, message, stack and cause", () => {
		const error = new Error("boom", { cause: new TypeError("inner") });
		const parsed = JSON.parse(serialize(error));
		expect(parsed.name).toBe("Error");
		expect(parsed.message).toBe("boom");
		expect(parsed.stack).toBe(error.stack);
		expect(parsed.cause).toMatchObject({ name: "TypeError", message: "inner" });
	});

	test("replaces a circular reference instead of throwing", () => {
		const node: Record<string, unknown> = { a: 1 };
		node.self = node;
		expect(serialize(node)).toBe('{"a":1,"self":"[Circular]"}');
	});

	test("keeps an object referenced twice without a cycle", () => {
		const shared = { x: 1 };
		expect(serialize([shared, shared])).toBe('[{"x":1},{"x":1}]');
	});

	test("writes a bigint as its decimal string", () => {
		expect(serialize({ n: 12345678901234567890n })).toBe('{"n":"12345678901234567890"}');
	});

	test("honours toJSON", () => {
		expect(serialize(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
	});

	test("survives a throwing getter", () => {
		const hostile = {
			get bad() {
				throw new Error("no");
			},
		};
		expect(serialize(hostile)).toBe('"[Unserializable]"');
	});

	test("returns undefined as text where JSON has no value", () => {
		expect(serialize(undefined)).toBe("undefined");
		expect(serialize(() => 1)).toBe("undefined");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/serialize.test.ts`
Expected: FAIL, module `../src/format/serialize` not found.

- [ ] **Step 3: Write the implementation**

`src/format/serialize.ts`:

```ts
function normalize(value: unknown, ancestors: object[]): unknown {
	if (typeof value === "bigint") return value.toString();
	if (typeof value !== "object" || value === null) return value;
	// Ancestors, not every object seen: an object referenced twice without a cycle is data.
	if (ancestors.includes(value)) return "[Circular]";
	ancestors.push(value);
	try {
		if (value instanceof Error) {
			const error: Record<string, unknown> = {
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
			if (value.cause !== undefined) error.cause = normalize(value.cause, ancestors);
			return error;
		}
		const { toJSON } = value as { toJSON?: unknown };
		if (typeof toJSON === "function") return normalize(toJSON.call(value), ancestors);
		if (Array.isArray(value)) return value.map((item) => normalize(item, ancestors));
		const plain: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) plain[key] = normalize(item, ancestors);
		return plain;
	} catch {
		// A throwing getter or toJSON must not turn a log call into an exception.
		return "[Unserializable]";
	} finally {
		ancestors.pop();
	}
}

// "undefined" where JSON.stringify returns nothing (undefined, a function, a symbol), as
// util.format's %j does, so callers always get text.
export function serialize(value: unknown): string {
	return JSON.stringify(normalize(value, [])) ?? "undefined";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/serialize.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/format/serialize.ts tests/serialize.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/format/serialize.ts tests/serialize.test.ts
git commit -m "feat(format): serialise log data to JSON without ever throwing

JSON.stringify throws on cycles and bigints and loses an Error's fields; a
logger that throws on the data it is given takes the application down with it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Message extraction for structured output

**Tier:** cheap

**Files:**
- Create: `src/format/specifiers.ts`
- Test: `tests/specifiers.test.ts`

**Interfaces:**
- Consumes: `serialize(value: unknown): string` (Task 3).
- Produces: `interface Message { msg: string; data: unknown }` and `formatMessage(args: readonly unknown[]): Message`, where `data === undefined` means "absent".

- [ ] **Step 1: Write the failing test**

`tests/specifiers.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { formatMessage } from "../src/format/specifiers";

describe("formatMessage: msg and data", () => {
	test.each([
		{ args: ["hello"], msg: "hello", data: undefined },
		{ args: ["hello", { id: 1 }], msg: "hello", data: { id: 1 } },
		{ args: ["hello", 1, 2], msg: "hello", data: [1, 2] },
		{ args: [{ id: 1 }], msg: "", data: { id: 1 } },
		{ args: [{ id: 1 }, "x"], msg: "", data: [{ id: 1 }, "x"] },
		{ args: [], msg: "", data: undefined },
	])("$args", ({ args, msg, data }) => {
		expect(formatMessage(args)).toEqual({ msg, data });
	});
});

describe("formatMessage: specifiers", () => {
	test("consume their arguments before msg/data", () => {
		expect(formatMessage(["user %s", "bob", { id: 3 }])).toEqual({
			msg: "user bob",
			data: { id: 3 },
		});
	});

	test("convert numbers like util.format", () => {
		expect(formatMessage(["%d %i %f", "42", "7.9", "1.5"]).msg).toBe("42 7 1.5");
		expect(formatMessage(["%d", "x"]).msg).toBe("NaN");
	});

	test("write objects as safe JSON", () => {
		expect(formatMessage(["%s|%j|%o|%O", { a: 1 }, { b: 2n }, [1], null]).msg).toBe(
			'{"a":1}|{"b":"2"}|[1]|null',
		);
	});

	test("never throw on a symbol", () => {
		expect(formatMessage(["%s %d", Symbol("x"), Symbol("y")]).msg).toBe("Symbol(x) NaN");
	});

	test("name a function instead of printing its source", () => {
		expect(formatMessage(["%s", function handler() {}]).msg).toBe("[Function: handler]");
	});

	test("drop %c and its CSS argument", () => {
		expect(formatMessage(["%cstyled", "color: red"])).toEqual({ msg: "styled", data: undefined });
	});

	test("turn %% into % without consuming", () => {
		expect(formatMessage(["100%% %s", "done"]).msg).toBe("100% done");
	});

	test("stay literal when no argument is left or the letter is unknown", () => {
		expect(formatMessage(["%s and %s", "a"]).msg).toBe("a and %s");
		expect(formatMessage(["%x %s", "a"]).msg).toBe("%x a");
		expect(formatMessage(["trailing %"]).msg).toBe("trailing %");
		expect(formatMessage(["50% done", 1])).toEqual({ msg: "50% done", data: 1 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/specifiers.test.ts`
Expected: FAIL, module `../src/format/specifiers` not found.

- [ ] **Step 3: Write the implementation**

`src/format/specifiers.ts`:

```ts
import { serialize } from "./serialize";

export interface Message {
	msg: string;
	data: unknown;
}

function convert(specifier: string, arg: unknown): string {
	switch (specifier) {
		case "s":
			if (typeof arg === "function") return `[Function: ${arg.name || "anonymous"}]`;
			return typeof arg === "object" && arg !== null ? serialize(arg) : String(arg);
		// Number() throws on a symbol; util.format prints NaN.
		case "d":
			return typeof arg === "symbol" ? "NaN" : String(Number(arg));
		case "i":
			return typeof arg === "symbol" ? "NaN" : String(Number.parseInt(String(arg), 10));
		case "f":
			return typeof arg === "symbol" ? "NaN" : String(Number.parseFloat(String(arg)));
		case "c":
			return "";
		default:
			return serialize(arg);
	}
}

const CONSUMING = new Set(["s", "d", "i", "f", "j", "o", "O", "c"]);

export function formatMessage(args: readonly unknown[]): Message {
	const [first] = args;
	if (typeof first !== "string") return { msg: "", data: dataOf(args) };
	let next = 1;
	let msg = "";
	let copied = 0;
	let at = first.indexOf("%");
	while (at !== -1 && at < first.length - 1) {
		const specifier = first.charAt(at + 1);
		if (specifier === "%") {
			msg += `${first.slice(copied, at)}%`;
			copied = at + 2;
		} else if (CONSUMING.has(specifier) && next < args.length) {
			msg += first.slice(copied, at) + convert(specifier, args[next++]);
			copied = at + 2;
		}
		at = first.indexOf("%", copied > at ? copied : at + 1);
	}
	msg += first.slice(copied);
	return { msg, data: dataOf(args.slice(next)) };
}

function dataOf(rest: readonly unknown[]): unknown {
	if (rest.length === 0) return undefined;
	return rest.length === 1 ? rest[0] : [...rest];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/specifiers.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/format/specifiers.ts tests/specifiers.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/format/specifiers.ts tests/specifiers.test.ts
git commit -m "feat(format): split console-style arguments into msg and data

Structured lines need to know which arguments the specifiers consumed; the
leftovers become data (absent, a value, or an array) instead of being glued
into the message.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Interactive renderers (pretty, TTY, browser)

**Tier:** standard

**Files:**
- Create: `src/renderers/record.ts`, `src/renderers/prefix.ts`, `src/renderers/pretty.ts`, `src/renderers/tty.ts`, `src/renderers/browser.ts`
- Test: `tests/renderers-interactive.test.ts`

**Interfaces:**
- Consumes: `LEVEL_NAMES`, `LEVEL_STYLES`, `type Level` (Task 1); `colorize` (Task 1).
- Produces:
  - `src/renderers/record.ts`: `interface LogRecord { level: Level; time: number; scope: string | undefined; datetime: boolean; args: readonly unknown[] }`, `type Renderer = (record: LogRecord) => unknown[]`.
  - `src/renderers/prefix.ts`: `LABELS: Record<Level, string>`, `formatDatetime(time: number): string`, `prepend(prefix: string, args: readonly unknown[], styles?: string[]): unknown[]`.
  - `src/renderers/pretty.ts`: `renderPretty: Renderer`.
  - `src/renderers/tty.ts`: `center(text: string, width: number): string`, `BADGES: Record<Level, string>`, `renderTty: Renderer`.
  - `src/renderers/browser.ts`: `BADGE_CSS: Record<Level, string>`, `renderBrowser: Renderer`.

- [ ] **Step 1: Write the failing test**

`tests/renderers-interactive.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { BADGE_CSS, renderBrowser } from "../src/renderers/browser";
import { formatDatetime, LABELS, prepend } from "../src/renderers/prefix";
import { renderPretty } from "../src/renderers/pretty";
import type { LogRecord } from "../src/renderers/record";
import { BADGES, center, renderTty } from "../src/renderers/tty";

const TIME = Date.UTC(2026, 8, 25, 10);
const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(
	TIME,
);

function record(overrides: Partial<LogRecord> = {}): LogRecord {
	return { level: "warn", time: TIME, scope: undefined, datetime: false, args: ["hi"], ...overrides };
}

describe("prefix helpers", () => {
	test("labels are the level keys in upper case", () => {
		expect(LABELS.success).toBe("SUCCESS");
		expect(LABELS.wth).toBe("WTH");
	});

	test("formatDatetime uses the runtime locale, short date and medium time", () => {
		expect(formatDatetime(TIME)).toBe(DATE);
	});

	test("prepend joins a string first argument so its specifiers stay live", () => {
		expect(prepend("[P]", ["user %s", "bob"])).toEqual(["[P] user %s", "bob"]);
	});

	test("prepend passes the prefix alone before a non-string first argument", () => {
		const data = { id: 1 };
		expect(prepend("[P]", [data, "x"])).toEqual(["[P]", data, "x"]);
		expect(prepend("[P]", [])).toEqual(["[P]"]);
	});

	test("prepend puts the prefix styles right after the format", () => {
		expect(prepend("%cP%c", ["hi", 1], ["a", "b"])).toEqual(["%cP%c hi", "a", "b", 1]);
		expect(prepend("%cP%c", [1], ["a", "b"])).toEqual(["%cP%c", "a", "b", 1]);
	});
});

describe("renderPretty", () => {
	test("brackets the label without padding", () => {
		expect(renderPretty(record())).toEqual(["[WARN] hi"]);
	});

	test("puts the scope inside the brackets", () => {
		expect(renderPretty(record({ scope: "db" }))).toEqual(["[WARN <db>] hi"]);
	});

	test("adds the date as its own bracketed block", () => {
		expect(renderPretty(record({ datetime: true }))).toEqual([`[WARN] [${DATE}] hi`]);
	});
});

describe("renderTty", () => {
	test("centres labels on the longest label plus one space each side", () => {
		expect(center("WARN", 9)).toBe("  WARN   ");
		expect(center("SUCCESS", 9)).toBe(" SUCCESS ");
	});

	test("paints the badge in the level colours", () => {
		expect(BADGES.warn).toBe("\u001B[38;5;15;48;5;208m  WARN   \u001B[0m");
		expect(renderTty(record())).toEqual([`${BADGES.warn} hi`]);
	});

	test("writes the scope in grey outside the badge", () => {
		expect(renderTty(record({ scope: "db" }))).toEqual([
			`${BADGES.warn} \u001B[90m<db>\u001B[0m hi`,
		]);
	});

	test("writes the date in lightgray", () => {
		expect(renderTty(record({ datetime: true }))).toEqual([
			`${BADGES.warn} \u001B[38;5;252m[${DATE}]\u001B[0m hi`,
		]);
	});
});

describe("renderBrowser", () => {
	test("draws the label as a padded, rounded badge", () => {
		expect(BADGE_CSS.warn).toBe(
			"color: white; background-color: orange; padding: 1px 4px; border-radius: 4px",
		);
		expect(renderBrowser(record({ args: ["user %s", "bob"] }))).toEqual([
			"%cWARN%c user %s",
			BADGE_CSS.warn,
			"",
			"bob",
		]);
	});

	test("puts the scope inside the badge", () => {
		expect(renderBrowser(record({ scope: "db" }))[0]).toBe("%cWARN <db>%c hi");
	});

	test("adds the date in lightgray after the badge", () => {
		expect(renderBrowser(record({ datetime: true }))).toEqual([
			`%cWARN%c %c[${DATE}]%c hi`,
			BADGE_CSS.warn,
			"",
			"color: lightgray",
			"",
		]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/renderers-interactive.test.ts`
Expected: FAIL, the `../src/renderers/*` modules do not exist.

- [ ] **Step 3: Write the record and prefix helpers**

`src/renderers/record.ts`:

```ts
import type { Level } from "../levels";

export interface LogRecord {
	level: Level;
	time: number;
	scope: string | undefined;
	datetime: boolean;
	args: readonly unknown[];
}

export type Renderer = (record: LogRecord) => unknown[];
```

`src/renderers/prefix.ts`:

```ts
import { LEVEL_NAMES, type Level } from "../levels";

export const LABELS = Object.fromEntries(
	LEVEL_NAMES.map((level) => [level, level.toUpperCase()]),
) as Record<Level, string>;

let dateFormat: Intl.DateTimeFormat | undefined;

// Built on first use: constructing an Intl.DateTimeFormat costs far more than formatting.
export function formatDatetime(time: number): string {
	dateFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });
	return dateFormat.format(time);
}

/**
 * Concatenated to a string first argument, so console.log still reads the caller's %s/%o as
 * its format; passed on its own otherwise. `styles` are the %c values the prefix itself
 * consumes, so they must come right after the format, before the caller's arguments.
 */
export function prepend(
	prefix: string,
	args: readonly unknown[],
	styles: string[] = [],
): unknown[] {
	const [first, ...rest] = args;
	if (typeof first === "string") return [`${prefix} ${first}`, ...styles, ...rest];
	return [prefix, ...styles, ...args];
}
```

- [ ] **Step 4: Write the three renderers**

`src/renderers/pretty.ts`:

```ts
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

export const renderPretty: Renderer = ({ level, time, scope, datetime, args }) => {
	let prefix = scope === undefined ? `[${LABELS[level]}]` : `[${LABELS[level]} <${scope}>]`;
	if (datetime) prefix += ` [${formatDatetime(time)}]`;
	return prepend(prefix, args);
};
```

`src/renderers/tty.ts`:

```ts
import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { colorize } from "../style/ansi";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

const WIDTH = Math.max(...LEVEL_NAMES.map((level) => level.length)) + 2;

export function center(text: string, width: number): string {
	const left = Math.floor((width - text.length) / 2);
	return " ".repeat(left) + text + " ".repeat(width - text.length - left);
}

export const BADGES = Object.fromEntries(
	LEVEL_NAMES.map((level) => [level, colorize(center(LABELS[level], WIDTH), LEVEL_STYLES[level])]),
) as Record<Level, string>;

// Bounded: the root caches scopes by name, so this holds one entry per scope ever created.
const scopeLabels = new Map<string, string>();

function scopeLabel(scope: string): string {
	let label = scopeLabels.get(scope);
	if (label === undefined) {
		label = colorize(`<${scope}>`, { color: "grey" });
		scopeLabels.set(scope, label);
	}
	return label;
}

export const renderTty: Renderer = ({ level, time, scope, datetime, args }) => {
	let prefix = BADGES[level];
	if (scope !== undefined) prefix += ` ${scopeLabel(scope)}`;
	if (datetime) prefix += ` ${colorize(`[${formatDatetime(time)}]`, { color: "lightgray" })}`;
	return prepend(prefix, args);
};
```

`src/renderers/browser.ts`:

```ts
import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

export const BADGE_CSS = Object.fromEntries(
	LEVEL_NAMES.map((level) => {
		const style = LEVEL_STYLES[level];
		return [
			level,
			`color: ${style.color}; background-color: ${style["background-color"]}; padding: 1px 4px; border-radius: 4px`,
		];
	}),
) as Record<Level, string>;

const DATE_CSS = "color: lightgray";

export const renderBrowser: Renderer = ({ level, time, scope, datetime, args }) => {
	const label = scope === undefined ? LABELS[level] : `${LABELS[level]} <${scope}>`;
	if (!datetime) return prepend(`%c${label}%c`, args, [BADGE_CSS[level], ""]);
	return prepend(`%c${label}%c %c[${formatDatetime(time)}]%c`, args, [
		BADGE_CSS[level],
		"",
		DATE_CSS,
		"",
	]);
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/renderers-interactive.test.ts`
Expected: PASS in both projects.

- [ ] **Step 6: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/renderers tests/renderers-interactive.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 7: Commit**

```bash
git add src/renderers tests/renderers-interactive.test.ts
git commit -m "feat(renderers): render the level prefix for terminals and devtools

The prefix is joined to a string first argument so console.log keeps
interpreting the caller's specifiers natively; labels and badges are built
once at load, off the hot path.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Structured renderers (json, logfmt)

**Tier:** cheap

**Files:**
- Create: `src/renderers/json.ts`, `src/renderers/logfmt.ts`
- Test: `tests/renderers-structured.test.ts`

**Interfaces:**
- Consumes: `LEVELS` (Task 1); `serialize` (Task 3); `formatMessage` (Task 4); `LogRecord`, `Renderer` (Task 5).
- Produces:
  - `src/renderers/json.ts`: `interface Entry { time: string; level: string; severity: number; scope: string | undefined; msg: string; data: unknown }`, `toEntry(record: LogRecord): Entry`, `renderJson: Renderer`.
  - `src/renderers/logfmt.ts`: `quote(value: string): string`, `renderLogfmt: Renderer`.

- [ ] **Step 1: Write the failing test**

`tests/renderers-structured.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { renderJson } from "../src/renderers/json";
import { quote, renderLogfmt } from "../src/renderers/logfmt";
import type { LogRecord } from "../src/renderers/record";

const TIME = Date.UTC(2026, 8, 25, 10);

function record(overrides: Partial<LogRecord> = {}): LogRecord {
	return {
		level: "warn",
		time: TIME,
		scope: "db",
		datetime: false,
		args: ["user %s", "bob", { id: 3 }],
		...overrides,
	};
}

describe("renderJson", () => {
	test("writes one line with the fields in order", () => {
		expect(renderJson(record())).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"scope":"db","msg":"user bob","data":{"id":3}}',
		]);
	});

	test("omits scope and data when absent", () => {
		expect(renderJson(record({ scope: undefined, args: ["hi"] }))).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"msg":"hi"}',
		]);
	});

	test("writes time in ISO whatever datetime says", () => {
		const [line] = renderJson(record({ datetime: true }));
		expect(JSON.parse(String(line)).time).toBe("2026-09-25T10:00:00.000Z");
	});

	test("writes an empty msg for a call without arguments", () => {
		expect(renderJson(record({ scope: undefined, args: [] }))).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"msg":""}',
		]);
	});

	test("survives circular data", () => {
		const node: Record<string, unknown> = {};
		node.self = node;
		const [line] = renderJson(record({ args: ["x", node] }));
		expect(JSON.parse(String(line)).data).toEqual({ self: "[Circular]" });
	});
});

describe("quote", () => {
	test("leaves a bare word alone", () => {
		expect(quote("bob")).toBe("bob");
	});

	test("quotes empty values and values with a space, quote or equals sign", () => {
		expect(quote("")).toBe('""');
		expect(quote("a b")).toBe('"a b"');
		expect(quote("a=b")).toBe('"a=b"');
		expect(quote('say "hi"')).toBe('"say \\"hi\\""');
	});

	test("escapes backslashes and control characters inside quotes", () => {
		expect(quote("a\\b c")).toBe('"a\\\\b c"');
		expect(quote("l1\nl2\tx")).toBe('"l1\\nl2\\tx"');
	});
});

describe("renderLogfmt", () => {
	test("writes the same fields in the same order, data as quoted JSON", () => {
		expect(renderLogfmt(record())).toEqual([
			'time=2026-09-25T10:00:00.000Z level=warn severity=13 scope=db msg="user bob" data="{\\"id\\":3}"',
		]);
	});

	test("omits scope and data when absent", () => {
		expect(renderLogfmt(record({ scope: undefined, args: ["hi"] }))).toEqual([
			"time=2026-09-25T10:00:00.000Z level=warn severity=13 msg=hi",
		]);
	});

	test("quotes a scope name with a space", () => {
		expect(renderLogfmt(record({ scope: "my db", args: ["hi"] }))[0]).toContain(
			' scope="my db" ',
		);
	});

	test("keeps an empty msg as an explicit empty value", () => {
		expect(renderLogfmt(record({ scope: undefined, args: [1] }))).toEqual([
			'time=2026-09-25T10:00:00.000Z level=warn severity=13 msg="" data=1',
		]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/renderers-structured.test.ts`
Expected: FAIL, modules `../src/renderers/json` and `../src/renderers/logfmt` not found.

- [ ] **Step 3: Write the implementation**

`src/renderers/json.ts`:

```ts
import { serialize } from "../format/serialize";
import { formatMessage } from "../format/specifiers";
import { LEVELS } from "../levels";
import type { LogRecord, Renderer } from "./record";

export interface Entry {
	time: string;
	level: string;
	severity: number;
	scope: string | undefined;
	msg: string;
	data: unknown;
}

// Field order is output order. An undefined scope or data is dropped by JSON.stringify and
// skipped by logfmt, which is how both omit absent fields.
export function toEntry({ level, time, scope, args }: LogRecord): Entry {
	const { msg, data } = formatMessage(args);
	return { time: new Date(time).toISOString(), level, severity: LEVELS[level], scope, msg, data };
}

export const renderJson: Renderer = (record) => [serialize(toEntry(record))];
```

`src/renderers/logfmt.ts`:

```ts
import { serialize } from "../format/serialize";
import { toEntry } from "./json";
import type { Renderer } from "./record";

const NEEDS_QUOTES = /[ "=\p{Cc}]/u;
const ESCAPES: Record<string, string> = {
	"\\": "\\\\",
	'"': '\\"',
	"\n": "\\n",
	"\r": "\\r",
	"\t": "\\t",
};

export function quote(value: string): string {
	if (value !== "" && !NEEDS_QUOTES.test(value)) return value;
	return `"${value.replace(/[\\"\n\r\t]/g, (char) => ESCAPES[char] ?? char)}"`;
}

export const renderLogfmt: Renderer = (record) => {
	const entry = toEntry(record);
	let line = `time=${entry.time} level=${entry.level} severity=${entry.severity}`;
	if (entry.scope !== undefined) line += ` scope=${quote(entry.scope)}`;
	line += ` msg=${quote(entry.msg)}`;
	if (entry.data !== undefined) line += ` data=${quote(serialize(entry.data))}`;
	return [line];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/renderers-structured.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/renderers/json.ts src/renderers/logfmt.ts tests/renderers-structured.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/json.ts src/renderers/logfmt.ts tests/renderers-structured.test.ts
git commit -m "feat(renderers): write json and logfmt lines for collectors

Both share one entry (time, level, severity, scope, msg, data) so the two
formats cannot drift; time is always ISO because a structured line without a
timestamp loses most of its use.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Renderer selection

**Tier:** cheap

**Files:**
- Create: `src/renderers/select.ts`
- Test: `tests/select.test.ts`

**Interfaces:**
- Consumes: `renderBrowser`, `renderPretty`, `renderTty` (Task 5); `renderJson`, `renderLogfmt` (Task 6); `Renderer` (Task 5).
- Produces: `FORMATS`, `type Format = "pretty" | "json" | "logfmt"`, `isFormat(value: unknown): value is Format`, `interface Output { isBrowser: boolean; tty: boolean; color: boolean; format: Format | undefined }`, `selectRenderer(output: Output): Renderer`.

- [ ] **Step 1: Write the failing test**

`tests/select.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { renderBrowser } from "../src/renderers/browser";
import { renderJson } from "../src/renderers/json";
import { renderLogfmt } from "../src/renderers/logfmt";
import { renderPretty } from "../src/renderers/pretty";
import { type Format, isFormat, type Output, selectRenderer } from "../src/renderers/select";
import { renderTty } from "../src/renderers/tty";

const node = { isBrowser: false, color: true } as const;

describe("selectRenderer", () => {
	test.each<[string, Output, unknown]>([
		["browser", { isBrowser: true, tty: false, color: true, format: "json" }, renderBrowser],
		[
			"browser without colour",
			{ isBrowser: true, tty: true, color: false, format: undefined },
			renderPretty,
		],
		["auto on a TTY", { ...node, tty: true, format: undefined }, renderTty],
		["auto off a TTY", { ...node, tty: false, format: undefined }, renderJson],
		["json on a TTY", { ...node, tty: true, format: "json" }, renderJson],
		["logfmt on a TTY", { ...node, tty: true, format: "logfmt" }, renderLogfmt],
		["logfmt off a TTY", { ...node, tty: false, format: "logfmt" }, renderLogfmt],
		["pretty on a TTY", { ...node, tty: true, format: "pretty" }, renderTty],
		[
			"pretty on a TTY without colour",
			{ ...node, tty: true, color: false, format: "pretty" },
			renderPretty,
		],
		[
			"auto on a TTY without colour",
			{ ...node, tty: true, color: false, format: undefined },
			renderPretty,
		],
		["pretty off a TTY", { ...node, tty: false, format: "pretty" }, renderPretty],
	])("%s", (_, output, renderer) => {
		expect(selectRenderer(output)).toBe(renderer);
	});
});

describe("isFormat", () => {
	test("accepts the three formats only", () => {
		for (const format of ["pretty", "json", "logfmt"] satisfies Format[]) {
			expect(isFormat(format)).toBe(true);
		}
		for (const value of ["xml", "JSON", "", undefined]) expect(isFormat(value)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/select.test.ts`
Expected: FAIL, module `../src/renderers/select` not found.

- [ ] **Step 3: Write the implementation**

`src/renderers/select.ts`:

```ts
import { renderBrowser } from "./browser";
import { renderJson } from "./json";
import { renderLogfmt } from "./logfmt";
import { renderPretty } from "./pretty";
import type { Renderer } from "./record";
import { renderTty } from "./tty";

export const FORMATS = ["pretty", "json", "logfmt"] as const;

export type Format = (typeof FORMATS)[number];

export function isFormat(value: unknown): value is Format {
	return (FORMATS as readonly unknown[]).includes(value);
}

export interface Output {
	isBrowser: boolean;
	tty: boolean;
	color: boolean;
	format: Format | undefined;
}

export function selectRenderer({ isBrowser, tty, color, format }: Output): Renderer {
	// Without colour the browser output is the pretty one: same bracketed prefix, no %c.
	if (isBrowser) return color ? renderBrowser : renderPretty;
	if (format === "json" || (format === undefined && !tty)) return renderJson;
	if (format === "logfmt") return renderLogfmt;
	if (tty && color) return renderTty;
	return renderPretty;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/select.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/renderers/select.ts tests/select.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/select.ts tests/select.test.ts
git commit -m "feat(renderers): pick the renderer from runtime, TTY, color and format

A pure function over the four inputs, so the whole selection table is tested
without faking a terminal; an unset format means json off a terminal, the
format collectors expect.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Root and scope loggers

**Tier:** standard

**Files:**
- Create: `src/logger.ts`
- Test: `tests/logger.test.ts`

**Interfaces:**
- Consumes: `isBrowser` (`src/env/detect.ts`, existing); `isTTY`, `noColor` (Task 2); `isLevel`, `LEVEL_NAMES`, `LEVELS`, `type Level` (Task 1); `Renderer` (Task 5); `type Format`, `isFormat`, `selectRenderer` (Task 7); `BADGES` (Task 5, test only).
- Produces:
  - `interface Logger` (`enabled: boolean`, `level: Level`, `datetime: boolean | undefined`, one `(...args: unknown[]) => void` method per level).
  - `interface RootLogger extends Logger` (`color: boolean`, `format: Format | undefined`, `scope(name: string): Logger`).
  - `interface Environment { isBrowser: boolean; tty: boolean; noColor: boolean }`.
  - `createRootLogger(environment?: Environment): RootLogger`, which defaults to the load-time flags.

- [ ] **Step 1: Write the failing test**

`tests/logger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { LEVEL_NAMES } from "../src/levels";
import { createRootLogger, type Environment } from "../src/logger";
import { BADGES } from "../src/renderers/tty";

const PIPE: Environment = { isBrowser: false, tty: false, noColor: false };
const TERMINAL: Environment = { isBrowser: false, tty: true, noColor: false };

let lines: unknown[][];

beforeEach(() => {
	lines = [];
	rs.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
		lines.push(args);
	});
});

afterEach(() => {
	rs.restoreAllMocks();
});

function entries(): Array<Record<string, unknown>> {
	return lines.map(([line]) => JSON.parse(String(line)));
}

describe("root logger", () => {
	test("has one method per level, shared on the prototype", () => {
		const root = createRootLogger(PIPE);
		for (const level of LEVEL_NAMES) {
			expect(typeof root[level]).toBe("function");
			expect(Object.hasOwn(root, level)).toBe(false);
		}
	});

	test("starts enabled, at wth, without datetime, format or NO_COLOR", () => {
		const root = createRootLogger(PIPE);
		expect(root.enabled).toBe(true);
		expect(root.level).toBe("wth");
		expect(root.datetime).toBeUndefined();
		expect(root.format).toBeUndefined();
		expect(root.color).toBe(true);
		expect(createRootLogger({ ...PIPE, noColor: true }).color).toBe(false);
	});

	test("logs every level by default, through console.log only", () => {
		const root = createRootLogger(PIPE);
		for (const level of LEVEL_NAMES) root[level]("x");
		expect(entries().map((entry) => entry.level)).toEqual(LEVEL_NAMES);
	});

	test("drops calls below its level", () => {
		const root = createRootLogger(PIPE);
		root.level = "warn";
		root.notice("dropped");
		root.warn("kept");
		expect(entries().map((entry) => entry.msg)).toEqual(["kept"]);
	});

	test("goes silent when disabled", () => {
		const root = createRootLogger(PIPE);
		root.enabled = false;
		root.emerg("dropped");
		expect(lines).toEqual([]);
	});

	test("never throws on data that cannot be serialised", () => {
		const hostile = {
			get bad() {
				throw new Error("no");
			},
		};
		createRootLogger(PIPE).info("x", hostile);
		expect(entries()[0]).toMatchObject({ msg: "x", data: "[Unserializable]" });
	});

	test("rejects an unknown level or format", () => {
		const root = createRootLogger(PIPE);
		expect(() => {
			(root as { level: string }).level = "warning";
		}).toThrow(TypeError);
		expect(() => {
			(root as { format: string }).format = "xml";
		}).toThrow(TypeError);
		expect(root.level).toBe("wth");
		expect(root.format).toBeUndefined();
	});
});

describe("output selection", () => {
	test("writes json off a TTY by default", () => {
		createRootLogger(PIPE).info("hi");
		expect(entries()[0]).toMatchObject({ level: "info", severity: 9, msg: "hi" });
	});

	test("writes coloured badges on a TTY by default", () => {
		createRootLogger(TERMINAL).info("hi");
		expect(lines[0]).toEqual([`${BADGES.info} hi`]);
	});

	test("follows format and color changes", () => {
		const root = createRootLogger(TERMINAL);
		root.format = "json";
		root.info("a");
		root.format = "logfmt";
		root.info("b");
		root.format = undefined;
		root.color = false;
		root.info("c");
		expect(lines.map(([line]) => String(line))).toEqual([
			expect.stringMatching(/^\{"time":/),
			expect.stringMatching(/^time=\S+ level=info severity=9 msg=b$/),
			"[INFO] c",
		]);
	});

	test("draws a %c badge in the browser", () => {
		createRootLogger({ isBrowser: true, tty: false, noColor: false }).info("hi");
		expect(lines[0]?.[0]).toBe("%cINFO%c hi");
	});
});

describe("scopes", () => {
	test("returns one instance per name, without a scope() of its own", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		expect(root.scope("db")).toBe(db);
		expect(root.scope("http")).not.toBe(db);
		expect("scope" in db).toBe(false);
	});

	test("tags their records with the scope name", () => {
		createRootLogger(PIPE).scope("db").info("hi");
		expect(entries()[0]).toMatchObject({ scope: "db", msg: "hi" });
	});

	test("apply the stricter of the root and scope levels", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		root.level = "warn";
		db.level = "debug";
		db.info("dropped by the root");
		db.level = "error";
		db.warn("dropped by the scope");
		db.error("kept");
		expect(entries().map((entry) => entry.msg)).toEqual(["kept"]);
	});

	test("are silenced by the root, and silence only themselves", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		root.enabled = false;
		db.emerg("dropped by the root");
		root.enabled = true;
		db.enabled = false;
		db.emerg("dropped by the scope");
		root.emerg("kept");
		expect(entries().map((entry) => entry.msg)).toEqual(["kept"]);
	});

	test("see root changes made after their creation", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		root.level = "error";
		db.warn("dropped");
		expect(lines).toEqual([]);
	});

	test("write through the root's current output", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		root.format = "pretty";
		db.info("hi");
		expect(lines).toEqual([["[INFO <db>] hi"]]);
	});

	test("resolve datetime as scope ?? root ?? false", () => {
		const root = createRootLogger(PIPE);
		root.format = "pretty";
		const db = root.scope("db");
		const dated = /^\[INFO <db>\] \[.+\] x$/;
		db.info("x");
		root.datetime = true;
		db.info("x");
		db.datetime = false;
		db.info("x");
		root.datetime = false;
		db.datetime = true;
		db.info("x");
		expect(lines.map(([line]) => dated.test(String(line)))).toEqual([false, true, false, true]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec rstest run tests/logger.test.ts`
Expected: FAIL, module `../src/logger` not found.

- [ ] **Step 3: Write the implementation**

`src/logger.ts`:

```ts
import { isBrowser } from "./env/detect";
import { isTTY, noColor } from "./env/tty";
import { isLevel, LEVEL_NAMES, LEVELS, type Level } from "./levels";
import type { Renderer } from "./renderers/record";
import { type Format, isFormat, selectRenderer } from "./renderers/select";

type LevelMethod = (...args: unknown[]) => void;

type LevelMethods = { [L in Level]: LevelMethod };

export interface Logger extends LevelMethods {
	enabled: boolean;
	level: Level;
	datetime: boolean | undefined;
}

export interface RootLogger extends Logger {
	color: boolean;
	format: Format | undefined;
	scope(name: string): Logger;
}

export interface Environment {
	isBrowser: boolean;
	tty: boolean;
	noColor: boolean;
}

abstract class BaseLogger {
	#enabled = true;
	#level: Level = "wth";
	#threshold: number = LEVELS.wth;
	#datetime: boolean | undefined;

	// Declared, not defined: a class field would shadow the prototype methods generated below.
	declare wth: LevelMethod;
	declare debug: LevelMethod;
	declare verb: LevelMethod;
	declare info: LevelMethod;
	declare success: LevelMethod;
	declare notice: LevelMethod;
	declare warn: LevelMethod;
	declare error: LevelMethod;
	declare crit: LevelMethod;
	declare alert: LevelMethod;
	declare emerg: LevelMethod;

	get enabled(): boolean {
		return this.#enabled;
	}

	set enabled(value: boolean) {
		this.#enabled = value;
	}

	get level(): Level {
		return this.#level;
	}

	set level(value: Level) {
		if (!isLevel(value)) throw new TypeError(`lololog: unknown level ${JSON.stringify(value)}`);
		this.#level = value;
		this.#threshold = LEVELS[value];
	}

	get datetime(): boolean | undefined {
		return this.#datetime;
	}

	set datetime(value: boolean | undefined) {
		this.#datetime = value;
	}

	accepts(severity: number): boolean {
		return this.#enabled && severity >= this.#threshold;
	}

	abstract write(level: Level, severity: number, args: unknown[]): void;
}

// One shared implementation per level, bound to its severity once, on the prototype: a Proxy
// would run a trap on every call, filtered ones included (~20 ns against ~0.3 ns measured).
for (const level of LEVEL_NAMES) {
	const severity = LEVELS[level];
	BaseLogger.prototype[level] = function (this: BaseLogger, ...args: unknown[]) {
		this.write(level, severity, args);
	};
}

class ScopedLogger extends BaseLogger implements Logger {
	readonly #root: RootLoggerImpl;
	readonly #name: string;

	constructor(root: RootLoggerImpl, name: string) {
		super();
		this.#root = root;
		this.#name = name;
	}

	write(level: Level, severity: number, args: unknown[]): void {
		const root = this.#root;
		if (!root.accepts(severity) || !this.accepts(severity)) return;
		root.emit(level, this.#name, this.datetime ?? root.datetime ?? false, args);
	}
}

class RootLoggerImpl extends BaseLogger implements RootLogger {
	readonly #environment: Environment;
	readonly #scopes = new Map<string, ScopedLogger>();
	#color: boolean;
	#format: Format | undefined;
	#renderer: Renderer;

	constructor(environment: Environment) {
		super();
		this.#environment = environment;
		this.#color = !environment.noColor;
		this.#renderer = this.#select();
	}

	get color(): boolean {
		return this.#color;
	}

	set color(value: boolean) {
		this.#color = value;
		this.#renderer = this.#select();
	}

	get format(): Format | undefined {
		return this.#format;
	}

	set format(value: Format | undefined) {
		if (value !== undefined && !isFormat(value)) {
			throw new TypeError(`lololog: unknown format ${JSON.stringify(value)}`);
		}
		this.#format = value;
		this.#renderer = this.#select();
	}

	scope(name: string): Logger {
		let scoped = this.#scopes.get(name);
		if (scoped === undefined) {
			scoped = new ScopedLogger(this, name);
			this.#scopes.set(name, scoped);
		}
		return scoped;
	}

	write(level: Level, severity: number, args: unknown[]): void {
		if (this.accepts(severity)) this.emit(level, undefined, this.datetime ?? false, args);
	}

	emit(level: Level, scope: string | undefined, datetime: boolean, args: unknown[]): void {
		console.log(...this.#renderer({ level, time: Date.now(), scope, datetime, args }));
	}

	#select(): Renderer {
		const { isBrowser, tty } = this.#environment;
		return selectRenderer({ isBrowser, tty, color: this.#color, format: this.#format });
	}
}

export function createRootLogger(
	environment: Environment = { isBrowser, tty: isTTY, noColor },
): RootLogger {
	return new RootLoggerImpl(environment);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec rstest run tests/logger.test.ts`
Expected: PASS in both projects.

- [ ] **Step 5: Format, lint, typecheck**

Run: `pnpm exec biome check --write src/logger.ts tests/logger.test.ts && pnpm exec biome check && pnpm typecheck`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/logger.ts tests/logger.test.ts
git commit -m "feat(logger): add the root and scope loggers

Scopes read the root's settings at each call instead of copying them, so
L.enabled = false or a stricter root level reaches every scope at once, with
nothing to invalidate.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Public entry and scaffolding cleanup

**Tier:** standard

**Files:**
- Create: `src/singleton.ts`
- Modify: `src/index.ts` (whole file replaced)
- Test: `tests/singleton.test.ts`; `tests/index.test.ts` (whole file replaced)
- Modify: `CHANGELOG.md`, `README.md`

**Interfaces:**
- Consumes: `createRootLogger`, `type Logger`, `type RootLogger` (Task 8); `LEVELS`, `type Level` (Task 1); `type Format` (Task 7).
- Produces: `shared<T>(scope: object, key: symbol, create: () => T): T`. Public API of `lololog`: `L`, `logger`, `LEVELS`, and the types `Level`, `Format`, `Logger`, `RootLogger`. `describeRuntime` and the environment flags are no longer exported.

- [ ] **Step 1: Write the failing tests**

`tests/singleton.test.ts`:

```ts
import { describe, expect, test } from "@rstest/core";
import { shared } from "../src/singleton";

const KEY = Symbol.for("lololog-test");

describe("shared", () => {
	test("creates the value once, then returns it", () => {
		const scope = {};
		let created = 0;
		const first = shared(scope, KEY, () => ({ n: ++created }));
		expect(shared(scope, KEY, () => ({ n: ++created }))).toBe(first);
		expect(created).toBe(1);
	});

	test("returns the value another copy already stored", () => {
		const existing = { from: "first copy" };
		const scope = { [KEY]: existing };
		expect(shared(scope, KEY, () => ({ from: "second copy" }))).toBe(existing);
	});
});
```

`tests/index.test.ts` (replaces the `describeRuntime` test):

```ts
import { describe, expect, test } from "@rstest/core";
import * as api from "../src/index";
import { L, LEVELS, logger } from "../src/index";

describe("public entry", () => {
	test("exports the root under a short and a long name", () => {
		expect(L).toBe(logger);
	});

	test("stores the root under Symbol.for('lololog')", () => {
		expect((globalThis as Record<symbol, unknown>)[Symbol.for("lololog")]).toBe(L);
	});

	test("exports the levels", () => {
		expect(LEVELS.warn).toBe(13);
	});

	test("exports nothing else at runtime", () => {
		expect(Object.keys(api).sort()).toEqual(["L", "LEVELS", "logger"]);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec rstest run tests/singleton.test.ts tests/index.test.ts`
Expected: FAIL, module `../src/singleton` not found, and `L` is not exported by `../src/index`.

- [ ] **Step 3: Write the implementation**

`src/singleton.ts`:

```ts
// Keyed by a registered symbol, so every copy of the library loaded in one realm (two
// versions in node_modules, two bundles) shares the first copy's value.
export function shared<T>(scope: object, key: symbol, create: () => T): T {
	const registry = scope as Record<symbol, T | undefined>;
	let value = registry[key];
	if (value === undefined) {
		value = create();
		registry[key] = value;
	}
	return value;
}
```

`src/index.ts` (whole file):

```ts
import { createRootLogger, type RootLogger } from "./logger";
import { shared } from "./singleton";

export const logger: RootLogger = shared(globalThis, Symbol.for("lololog"), () =>
	createRootLogger(),
);
export const L: RootLogger = logger;

export { type Level, LEVELS } from "./levels";
export type { Logger, RootLogger } from "./logger";
export type { Format } from "./renderers/select";
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS in both projects; `tests/detect.test.ts` and `tests/node-builtin.test.ts` are untouched and still pass.

- [ ] **Step 5: Update CHANGELOG.md**

Under `## [Unreleased]`, add:

```markdown
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
```

- [ ] **Step 6: Update README.md**

Replace the `## Status` section with:

````markdown
## Status

Early development: the API may change before 1.0.

## Usage

```ts
import { L } from "lololog"; // or: import { logger } from "lololog"

L.info("user %s connected", "bob", { id: 3 });

const db = L.scope("db");
db.level = "warn"; // this scope only
L.enabled = false; // silences the root and every scope
```

In a terminal, each line starts with a coloured level badge; in browser
devtools, with a styled badge. When stdout is not a terminal, lines are JSON
by default; set `L.format` to `"logfmt"` or `"pretty"` to change it.
````

- [ ] **Step 7: Format, lint, typecheck, build**

Run: `pnpm exec biome check --write src tests && pnpm exec biome check && pnpm typecheck && pnpm build && pnpm lint:package`
Expected: no diagnostics; publint and attw clean.

- [ ] **Step 8: Commit**

```bash
git add src/singleton.ts src/index.ts tests/singleton.test.ts tests/index.test.ts CHANGELOG.md README.md
git commit -m "feat: export the L logger as the package entry point

One root per realm under Symbol.for(\"lololog\"), so two copies of the library
share their settings. The environment flags and describeRuntime were scaffolding
placeholders; exporting them would freeze an internal API.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Consumer fixtures

**Tier:** standard

**Files:**
- Modify: `tests/consumers/node/index.mjs` (whole file)
- Modify: `tests/consumers/webpack/src/index.js`, `tests/consumers/rspack/src/index.js`, `tests/consumers/rsbuild/src/index.js` (whole files, same content)
- Modify: `tests/consumers/vite/src/main.ts` (whole file)

**Interfaces:**
- Consumes: the packed package's public API (Task 9): `L`, `logger`, `LEVELS`.
- Produces: fixtures that pass `npm run check`. The browser ones set `window.__result = "browser"`, which `tests/consumers/run-in-browser.mjs` (unchanged) expects.

- [ ] **Step 1: Rewrite the Node fixture**

`tests/consumers/node/index.mjs`:

```js
import { L, LEVELS, logger } from "lololog";

if (L !== logger) throw new Error("L and logger are different objects");
if (LEVELS.warn !== 13) throw new Error(`expected LEVELS.warn = 13, got ${LEVELS.warn}`);

const calls = [];
const log = console.log;
console.log = (...args) => calls.push(args);
try {
	L.scope("app").warn("hello %s", "world", { id: 1 });
} finally {
	console.log = log;
}

// CI pipes stdout (json); a developer running the fixture by hand may have a terminal.
if (process.stdout.isTTY) {
	if (!String(calls[0]?.[0]).includes("WARN")) {
		throw new Error(`expected a WARN badge, got ${JSON.stringify(calls)}`);
	}
} else {
	const entry = JSON.parse(String(calls[0]?.[0]));
	const expected = { level: "warn", severity: 13, scope: "app", msg: "hello world", data: { id: 1 } };
	for (const [key, value] of Object.entries(expected)) {
		if (JSON.stringify(entry[key]) !== JSON.stringify(value)) {
			throw new Error(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(entry[key])}`);
		}
	}
}
console.log("ok: node");
```

- [ ] **Step 2: Rewrite the bundler fixtures**

`tests/consumers/webpack/src/index.js`, `tests/consumers/rspack/src/index.js` and `tests/consumers/rsbuild/src/index.js` (identical):

```js
import { L } from "lololog";

const calls = [];
const log = console.log;
console.log = (...args) => calls.push(args);
try {
	L.scope("app").warn("hello %s", "world");
} finally {
	console.log = log;
}

const [format, badge] = calls[0] ?? [];
window.__result =
	format === "%cWARN <app>%c hello %s" && String(badge).includes("background-color: orange")
		? "browser"
		: `unexpected: ${JSON.stringify(calls)}`;
```

`tests/consumers/vite/src/main.ts`:

```ts
import { L } from "lololog";

declare global {
	interface Window {
		__result?: string;
	}
}

const calls: unknown[][] = [];
const log = console.log;
console.log = (...args: unknown[]) => {
	calls.push(args);
};
try {
	L.scope("app").warn("hello %s", "world");
} finally {
	console.log = log;
}

const [format, badge] = calls[0] ?? [];
window.__result =
	format === "%cWARN <app>%c hello %s" && String(badge).includes("background-color: orange")
		? "browser"
		: `unexpected: ${JSON.stringify(calls)}`;
```

- [ ] **Step 3: Format and lint**

Run: `pnpm exec biome check --write tests/consumers && pnpm exec biome check`
Expected: no diagnostics.

- [ ] **Step 4: Run the consumer tests**

Run: `pnpm test:consumers`
Expected: `✓ node`, `✓ rsbuild`, `✓ rspack`, `✓ webpack`, `✓ vite`, and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/consumers
git commit -m "test(consumers): log through L in every fixture

The fixtures checked describeRuntime, which is gone; they now prove that each
toolchain bundles a logger that writes json under Node and %c badges in the
browser.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Branch verification

**Tier:** standard

**Files:** none unless a check fails.

- [ ] **Step 1: Run every delivery check**

Run: `pnpm exec biome ci && pnpm typecheck && pnpm build && pnpm lint:package && pnpm test && pnpm test:consumers`
Expected: every command exits 0.

- [ ] **Step 2: Check the three outputs by eye**

Create the throwaway `.scratchpad/show-output.mjs` (git-ignored; never in `src/`, `tests/` or `scripts/`):

```js
import { L } from "../dist/index.js";

L.datetime = true;
L.success("done");
L.scope("db").warn("slow %s", "query");
```

Run it three ways and compare with spec § 4:

- Terminal: `node .scratchpad/show-output.mjs`. Expected: a green ` SUCCESS ` badge, then an orange `  WARN   ` badge followed by a grey `<db>`, each followed by a lightgray `[date]` and the message.
- Pipe: `node .scratchpad/show-output.mjs | cat`. Expected: two JSON lines with ISO `time`, `level`, `severity`, and `scope: "db"` on the second.
- `NO_COLOR=1 node .scratchpad/show-output.mjs`. Expected: `[SUCCESS] [date] done` and `[WARN <db>] [date] slow query`.

- [ ] **Step 3: Report**

Report the command outputs. Do not merge: merging (`git merge --no-ff`) and updating the Serena memories (`project/overview` still describes the exported environment flags) happen after the user validates the branch.
