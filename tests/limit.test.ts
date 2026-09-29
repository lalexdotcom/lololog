import { describe, expect, test } from "@rstest/core";
import { callerFrame, callSite } from "../src/limit";

type WithLimit = ErrorConstructor & { stackTraceLimit?: number };

// Stands in for a level method: callSite() returns the frame that called probe.
function probe(): string | undefined {
	return callSite();
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
		// @ts-expect-error: TS doesn't recognize stackTraceLimit as optional on Error in strict mode.
		delete E.stackTraceLimit;
		try {
			expect(probe()).toBeUndefined();
			expect(Object.hasOwn(Error, "stackTraceLimit")).toBe(false);
		} finally {
			E.stackTraceLimit = saved;
		}
	});
});
