import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { callerFrame, callSite, type LimitHost } from "../src/limit";
import { createRootLogger, type Environment } from "../src/logger";

type WithLimit = ErrorConstructor & { stackTraceLimit?: number };

// Stands in for a level method: callSite() returns the frame that called probe.
function probe(): string | undefined {
	return callSite();
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

	test("does not count filtered calls", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		const log = (i: number) => db.limit(2).info(`row ${i}`);
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
	});

	test("offers the plain call only", () => {
		const view = createRootLogger(PIPE).limit(1);
		// @ts-expect-error: a limited view has no spinner
		expect(view.info.spin).toBeUndefined();
	});
});
