import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { callerFrame, callSite, type LimitHost, siteKey } from "../src/limit";
import { createRootLogger, type Environment } from "../src/logger";

type WithLimit = ErrorConstructor & { stackTraceLimit?: number };

// Stands in for a level method: callSite() returns the frame that called probe. Not
// `return callSite()`: JavaScriptCore drops the frame of a function that tail-calls, and the key
// would name probe's caller's caller. The helpers below use block bodies for the same reason.
function probe(): string | undefined {
	const key = callSite();
	return key;
}

const PIPE: Environment = { isBrowser: false, tty: false, noColor: false };

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

function messages(): unknown[] {
	return entries().map((entry) => entry.msg);
}

// Counts `new Error()` during run. Not through an accessor on Error.stackTraceLimit: V8 reads that
// only as a data property and records no stack at all behind a getter.
function captures(run: () => void): number {
	const Original = globalThis.Error;
	let count = 0;
	class Counting extends Original {
		constructor(...args: ConstructorParameters<ErrorConstructor>) {
			super(...args);
			count++;
		}
	}
	globalThis.Error = Counting as unknown as ErrorConstructor;
	try {
		run();
	} finally {
		globalThis.Error = Original;
	}
	return count;
}

describe("callerFrame", () => {
	test("reads the third frame of a V8 stack, past its Error line", () => {
		const stack = [
			"Error",
			"    at callSite (file:///app/limit.js:5:17)",
			"    at LimitedView.debug (file:///app/limit.js:30:22)",
			"    at main (file:///app/main.js:10:14)",
		].join("\n");
		expect(callerFrame(stack)).toBe("    at main (file:///app/main.js:10:14)");
	});

	test("reads the third frame of a SpiderMonkey stack, however long", () => {
		const stack = [
			"callSite@http://localhost/limit.js:5:17",
			"debug@http://localhost/limit.js:30:22",
			"main@http://localhost/main.js:10:14",
			"@http://localhost/main.js:20:1",
			"",
		].join("\n");
		expect(callerFrame(stack)).toBe("main@http://localhost/main.js:10:14");
	});

	test("reads the third frame of a JavaScriptCore stack", () => {
		const stack = [
			"callSite@http://localhost/limit.js:5:17",
			"debug@http://localhost/limit.js:30:22",
			"main@http://localhost/main.js:10:14",
		].join("\n");
		expect(callerFrame(stack)).toBe("main@http://localhost/main.js:10:14");
	});

	test("returns undefined for a stack too short or missing", () => {
		expect(callerFrame("Error\n    at callSite (x.js:1:1)")).toBeUndefined();
		expect(callerFrame("callSite@x.js:1:1\ndebug@x.js:2:1\n")).toBeUndefined();
		expect(callerFrame(undefined)).toBeUndefined();
	});

	test("skips the native frame a JavaScriptCore tail call leaves in the caller's slot", () => {
		const stack = [
			"callSite@http://localhost/limit.js:5:17",
			"debug@http://localhost/limit.js:30:22",
			"forEach@[native code]",
			"main@http://localhost/main.js:10:14",
		].join("\n");
		expect(callerFrame(stack)).toBe("main@http://localhost/main.js:10:14");
	});

	test("returns null when only native frames follow, so a deeper capture can reach the caller", () => {
		const stack = [
			"callSite@http://localhost/limit.js:5:17",
			"debug@http://localhost/limit.js:30:22",
			"forEach@[native code]",
		].join("\n");
		expect(callerFrame(stack)).toBeNull();
	});
});

describe("callSite", () => {
	test("tells two calls on one line apart, and one call reached twice not", () => {
		const keys: Array<string | undefined> = [];
		for (let i = 0; i < 2; i++) keys.push(probe(), probe());
		expect(keys[0]).toEqual(expect.any(String));
		expect(keys[1]).toEqual(expect.any(String));
		expect(keys[0]).not.toBe(keys[1]);
		expect(keys[2]).toBe(keys[0]);
		expect(keys[3]).toBe(keys[1]);
	});

	test("restores Error.stackTraceLimit, whatever it was", () => {
		const E = Error as WithLimit;
		const saved = E.stackTraceLimit;
		try {
			for (const value of [0, 7, Number.POSITIVE_INFINITY]) {
				E.stackTraceLimit = value;
				expect(probe()).toEqual(expect.any(String));
				expect(E.stackTraceLimit).toBe(value);
			}
		} finally {
			E.stackTraceLimit = saved;
		}
	});

	test("returns undefined, and adds nothing to Error, when no stack is recorded", () => {
		const E = Error as WithLimit;
		const saved = E.stackTraceLimit;
		delete (Error as { stackTraceLimit?: number }).stackTraceLimit;
		try {
			expect(probe()).toBeUndefined();
			expect(Object.hasOwn(Error, "stackTraceLimit")).toBe(false);
		} finally {
			E.stackTraceLimit = saved;
		}
	});

	test("keys a call site by file, line and column, not V8's formatted frame", () => {
		const key = probe();
		expect(key).toMatch(/:\d+:\d+$/);
		expect(key).not.toMatch(/^\s*at /);
	});

	test("restores Error.prepareStackTrace, and leaves none where there was none", () => {
		// Not intersected with ErrorConstructor: Node's declares prepareStackTrace as required,
		// and TS refuses `delete` through that intersection (TS2790).
		const E = Error as unknown as { prepareStackTrace?: unknown };
		const had = Object.hasOwn(Error, "prepareStackTrace");
		const saved = E.prepareStackTrace;
		const custom = () => "custom";
		try {
			E.prepareStackTrace = custom;
			probe();
			expect(E.prepareStackTrace).toBe(custom);
			delete E.prepareStackTrace;
			probe();
			expect(Object.hasOwn(Error, "prepareStackTrace")).toBe(false);
		} finally {
			if (had) E.prepareStackTrace = saved;
			else delete E.prepareStackTrace;
		}
	});

	test("restores both globals when the capture itself throws", () => {
		// A stack overflow deep in a recursive caller is the reviewer's real repro, but its depth
		// varies by engine and stack layout; a throwing `stack` getter reproduces the same failure
		// (an exception between setting the globals and restoring them) deterministically.
		const Original = globalThis.Error;
		const originalLimit = (Original as WithLimit).stackTraceLimit;
		const originalHadHook = Object.hasOwn(Original, "prepareStackTrace");
		const originalHook = (Original as unknown as { prepareStackTrace?: unknown }).prepareStackTrace;

		class Throws extends Original {
			constructor(...args: ConstructorParameters<ErrorConstructor>) {
				super(...args);
				// `new Original`, not `new Error`: Error is Throws while this getter runs, and
				// `new Error` here would recurse into this same constructor forever.
				Object.defineProperty(this, "stack", {
					get(): never {
						throw new Original("boom");
					},
				});
			}
		}
		globalThis.Error = Throws as unknown as ErrorConstructor;

		const limitBefore = (Error as WithLimit).stackTraceLimit;
		const hadHookBefore = Object.hasOwn(Error, "prepareStackTrace");
		const hookBefore = (Error as unknown as { prepareStackTrace?: unknown }).prepareStackTrace;

		try {
			expect(() => probe()).toThrow("boom");
			expect((Error as WithLimit).stackTraceLimit).toBe(limitBefore);
			expect(Object.hasOwn(Error, "prepareStackTrace")).toBe(hadHookBefore);
			if (hadHookBefore) {
				expect((Error as unknown as { prepareStackTrace?: unknown }).prepareStackTrace).toBe(
					hookBefore,
				);
			}
		} finally {
			globalThis.Error = Original;
		}

		expect((Original as WithLimit).stackTraceLimit).toBe(originalLimit);
		expect(Object.hasOwn(Original, "prepareStackTrace")).toBe(originalHadHook);
		if (originalHadHook) {
			expect((Original as unknown as { prepareStackTrace?: unknown }).prepareStackTrace).toBe(
				originalHook,
			);
		}
	});
});

describe("siteKey", () => {
	const site = (file: string, line: number, column: number) => ({
		getFileName: () => file,
		getLineNumber: () => line,
		getColumnNumber: () => column,
	});

	test("keys the third CallSite as file:line:column", () => {
		const sites = [site("limit.js", 5, 17), site("limit.js", 30, 22), site("main.js", 10, 14)];
		expect(siteKey(sites)).toBe("main.js:10:14");
		expect(siteKey(sites.slice(0, 2))).toBeUndefined();
	});

	test("falls back to the text frame when the engine ignored the hook", () => {
		const stack = [
			"Error",
			"    at callSite (file:///app/limit.js:5:17)",
			"    at LimitedView.debug (file:///app/limit.js:30:22)",
			"    at main (file:///app/main.js:10:14)",
		].join("\n");
		expect(siteKey(stack)).toBe("    at main (file:///app/main.js:10:14)");
		expect(siteKey(undefined)).toBeUndefined();
	});

	test("returns undefined for a non-array, non-string stack", () => {
		expect(siteKey(42)).toBeUndefined();
	});

	test("keys an eval'd site (no file name) by its string form", () => {
		const evalSite = {
			getFileName: () => undefined,
			getLineNumber: () => 1,
			getColumnNumber: () => 27,
			toString: () => "inner (webpack://app/./src/a.js:1:27)",
		};
		const sites = [site("limit.js", 5, 17), site("limit.js", 30, 22), evalSite];
		expect(siteKey(sites)).toBe("inner (webpack://app/./src/a.js:1:27)");
	});

	test("skips native call sites, and returns null when nothing else follows", () => {
		const native = { ...site("native", 0, 0), isNative: () => true };
		const sites = [site("limit.js", 5, 17), site("limit.js", 30, 22), native];
		expect(siteKey([...sites, site("main.js", 10, 14)])).toBe("main.js:10:14");
		expect(siteKey(sites)).toBeNull();
	});
});

describe("limit", () => {
	test("shows the first n lines of a call site", () => {
		const root = createRootLogger(PIPE);
		for (let i = 0; i < 5; i++) root.limit(3).info(`row ${i}`);
		expect(messages()).toEqual(["row 0", "row 1", "row 2"]);
	});

	test("shows nothing at 0", () => {
		const root = createRootLogger(PIPE);
		for (let i = 0; i < 2; i++) root.limit(0).info("never");
		expect(messages()).toEqual([]);
	});

	test("counts each call site apart, even on one line", () => {
		const root = createRootLogger(PIPE);
		const both = () => [root.limit(1).info("a"), root.limit(1).info("b")];
		both();
		both();
		expect(messages()).toEqual(["a", "b"]);
	});

	test("writes through the logger that made the view", () => {
		const root = createRootLogger(PIPE);
		root.scope("db").limit(1).warn("x");
		expect(entries()[0]).toMatchObject({ level: "warn", scope: "db", msg: "x" });
	});

	test("shares an explicit key across levels, scopes and sites", () => {
		const root = createRootLogger(PIPE);
		root.limit("k", 2).info("a");
		root.scope("db").limit("k", 2).warn("b");
		root.limit("k", 2).error("c");
		expect(messages()).toEqual(["a", "b"]);
	});

	test("stops each call at its own n on a shared key", () => {
		const root = createRootLogger(PIPE);
		root.limit("k", 1).info("a");
		root.limit("k", 1).info("b");
		root.limit("k", 3).info("c");
		root.limit("k", 3).info("d");
		root.limit("k", 3).info("e");
		expect(messages()).toEqual(["a", "c", "d"]);
	});

	test("keeps explicit keys and call sites apart", () => {
		const root = createRootLogger(PIPE) as unknown as LimitHost;
		expect(root.admit("key", "x", 1)).toBe(true);
		expect(root.admit("site", "x", 1)).toBe(true);
		expect(root.admit("key", "x", 1)).toBe(false);
	});

	test("keys a hoisted view by its first line, shared by all its sites", () => {
		const root = createRootLogger(PIPE);
		const capped = root.limit(2);
		capped.info("a");
		capped.warn("b");
		capped.error("c");
		expect(messages()).toEqual(["a", "b"]);
	});

	test("counts a site called back by a native function in tail position", () => {
		const root = createRootLogger(PIPE);
		// biome-ignore lint/suspicious/useIterableCallbackReturn: the expression body is the tail call JavaScriptCore drops the frame of, leaving forEach's native frame as the third
		[1, 2, 3, 4, 5].forEach((i) => root.limit(3).info(`row ${i}`));
		expect(messages()).toEqual(["row 1", "row 2", "row 3"]);
	});

	test("does not count filtered calls", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		const log = (i: number) => {
			db.limit(2).info(`row ${i}`);
		};
		root.level = "warn";
		log(0);
		root.level = "wth";
		db.enabled = false;
		log(1);
		db.enabled = true;
		root.enabled = false;
		log(2);
		root.enabled = true;
		for (let i = 3; i < 6; i++) log(i);
		expect(messages()).toEqual(["row 3", "row 4"]);
	});

	test("captures no stack for a filtered call or an explicit key", () => {
		const root = createRootLogger(PIPE);
		root.level = "warn";
		expect(captures(() => root.limit(1).info("filtered"))).toBe(0);
		root.level = "wth";
		expect(captures(() => root.limit("k", 1).info("keyed"))).toBe(0);
		expect(captures(() => root.limit(1).info("keyless"))).toBe(1);
	});

	test("shows every line when no stack can be read", () => {
		const root = createRootLogger(PIPE);
		const E = Error as WithLimit;
		const saved = E.stackTraceLimit;
		delete (Error as { stackTraceLimit?: number }).stackTraceLimit;
		try {
			for (let i = 0; i < 3; i++) root.limit(1).info(`row ${i}`);
		} finally {
			E.stackTraceLimit = saved;
		}
		expect(messages()).toEqual(["row 0", "row 1", "row 2"]);
	});

	test("rejects a limit that is not an integer ≥ 0", () => {
		const root = createRootLogger(PIPE);
		for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => root.limit(n)).toThrow("lololog: invalid limit");
			expect(() => root.limit("k", n)).toThrow(TypeError);
		}
		expect(() => (root.limit as unknown as (key: string) => unknown)("k")).toThrow(TypeError);
		expect(() => root.limit("k", "3" as unknown as number)).toThrow(TypeError);
	});

	test("shows nothing at 0 on an explicit key", () => {
		const root = createRootLogger(PIPE);
		for (let i = 0; i < 2; i++) root.limit("k", 0).info("never");
		expect(messages()).toEqual([]);
	});

	test("offers the plain call only", () => {
		const view = createRootLogger(PIPE).limit(1);
		// @ts-expect-error: a limited view has no spinner
		expect(view.info.spin).toBeUndefined();
	});
});

describe("once", () => {
	test("shows a call site once", () => {
		const root = createRootLogger(PIPE);
		for (let i = 0; i < 3; i++) root.once().warn("legacy");
		expect(messages()).toEqual(["legacy"]);
	});

	test("counts each call site apart, even on one line", () => {
		const root = createRootLogger(PIPE);
		const both = () => [root.once().info("a"), root.once().info("b")];
		both();
		both();
		expect(messages()).toEqual(["a", "b"]);
	});

	test("shares a key across levels and scopes", () => {
		const root = createRootLogger(PIPE);
		root.once("k").info("a");
		root.scope("db").once("k").warn("b");
		expect(messages()).toEqual(["a"]);
	});

	test("keys a hoisted view by its first line, shared by all its sites", () => {
		const root = createRootLogger(PIPE);
		const first = root.once();
		first.info("a");
		first.warn("b");
		expect(messages()).toEqual(["a"]);
	});

	test("writes through the logger that made the view", () => {
		const root = createRootLogger(PIPE);
		root.scope("db").once().info("x");
		expect(entries()[0]).toMatchObject({ scope: "db", msg: "x" });
	});

	test("does not count filtered calls, nor capture a stack for them", () => {
		const root = createRootLogger(PIPE);
		const log = () => {
			root.once().info("x");
		};
		root.level = "warn";
		expect(captures(log)).toBe(0);
		root.level = "wth";
		log();
		log();
		expect(messages()).toEqual(["x"]);
	});

	test("is a call, not a table of level methods", () => {
		const root = createRootLogger(PIPE);
		// @ts-expect-error: once is called, L.once.warn does not exist
		expect(root.once.warn).toBeUndefined();
		// @ts-expect-error: a limited method has no spinner
		expect(root.once().info.spin).toBeUndefined();
		// @ts-expect-error: a limited method has no exec
		expect(root.once("k").info.exec).toBeUndefined();
	});
});
