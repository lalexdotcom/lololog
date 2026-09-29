import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import type { LogOptions } from "../src/index";
import { createRootLogger, type Environment } from "../src/logger";
import { checkOptions } from "../src/overrides";

const PIPE: Environment = { isBrowser: false, tty: false, noColor: false };
const DATED: LogOptions = { datetime: true };

let lines: unknown[][];

beforeEach(() => {
	lines = [];
	rs.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
		lines.push(args);
	});
	rs.useFakeTimers();
});

afterEach(() => {
	rs.useRealTimers();
	rs.restoreAllMocks();
});

function pretty() {
	const root = createRootLogger(PIPE);
	root.format = "pretty";
	return root;
}

// A pretty line shows its date in brackets right after the level badge and the scope, if any.
function dated(): boolean[] {
	return lines.map(([line]) => /^\[[A-Z]+\](?: <\w+>)? \[[^\]]+\] /.test(String(line)));
}

describe("checkOptions", () => {
	test("returns a copy holding datetime", () => {
		const options = { datetime: true };
		const checked = checkOptions(options);
		expect(checked).toEqual({ datetime: true });
		expect(checked).not.toBe(options);
	});

	test("accepts no override", () => {
		expect(checkOptions({})).toEqual({ datetime: undefined });
		expect(checkOptions({ datetime: undefined })).toEqual({ datetime: undefined });
		expect(checkOptions(Object.create(null))).toEqual({ datetime: undefined });
	});

	test("rejects anything but an object", () => {
		for (const value of [undefined, null, true, 1, "x", [], () => {}]) {
			expect(() => checkOptions(value)).toThrow(
				new TypeError("lololog: options must be an object"),
			);
		}
	});

	test("rejects a key that is not an overridable setting", () => {
		expect(() => checkOptions({ date: true })).toThrow(
			new TypeError('lololog: unknown option "date"'),
		);
		expect(() => checkOptions({ datetime: true, color: false })).toThrow(
			new TypeError('lololog: unknown option "color"'),
		);
	});

	test("rejects a datetime that is not a boolean", () => {
		expect(() => checkOptions({ datetime: "yes" })).toThrow(
			new TypeError("lololog: invalid datetime yes"),
		);
		expect(() => checkOptions({ datetime: 1 })).toThrow(
			new TypeError("lololog: invalid datetime 1"),
		);
	});
});

describe("options", () => {
	test("dates one line without touching the logger", () => {
		const root = pretty();
		root.options({ datetime: true }).info("x");
		root.info("y");
		expect(dated()).toEqual([true, false]);
		expect(root.datetime).toBeUndefined();
	});

	test("overrides the root either way", () => {
		const root = pretty();
		root.datetime = false;
		root.options({ datetime: true }).info("x");
		root.datetime = true;
		root.options({ datetime: false }).info("x");
		expect(dated()).toEqual([true, false]);
		expect(root.datetime).toBe(true);
	});

	test("overrides a scope, and falls back on scope ?? root without an override", () => {
		const root = pretty();
		const db = root.scope("db");
		db.datetime = true;
		db.options({ datetime: false }).info("x");
		db.options({}).info("x");
		db.datetime = undefined;
		root.datetime = true;
		db.options({ datetime: undefined }).info("x");
		expect(dated()).toEqual([false, true, true]);
		expect(lines[0][0]).toBe("[INFO] <db> x");
		expect(db.datetime).toBeUndefined();
	});

	test("carries the override on every call of a reused view, at every level", () => {
		const root = pretty();
		const view = root.options(DATED);
		view.info("a");
		view.warn("b");
		view.info("c");
		expect(dated()).toEqual([true, true, true]);
	});

	test("goes through the logger's filter", () => {
		const root = pretty();
		const db = root.scope("db");
		root.level = "warn";
		root.options(DATED).info("filtered");
		root.level = "wth";
		db.enabled = false;
		db.options(DATED).info("scope off");
		db.enabled = true;
		root.enabled = false;
		db.options(DATED).info("root off");
		root.options(DATED).info("root off");
		expect(lines).toEqual([]);
	});

	test("hands out detachable methods", () => {
		const root = pretty();
		const { warn } = root.options(DATED);
		warn("x");
		expect(dated()).toEqual([true]);
	});

	test("validates at the call, even for a line that will be filtered", () => {
		const root = pretty();
		root.level = "emerg";
		// @ts-expect-error: date is not an option
		expect(() => root.options({ date: true })).toThrow(
			new TypeError('lololog: unknown option "date"'),
		);
	});

	test("offers one options() per chain", () => {
		const view = pretty().options(DATED);
		// @ts-expect-error: an options view has no options()
		expect(view.options).toBeUndefined();
	});
});

describe("options spinner", () => {
	test("dates every frame and the final line, whatever the root says meanwhile", () => {
		const root = pretty();
		const spinner = root.options(DATED).info.spin("a");
		root.datetime = false;
		rs.advanceTimersByTime(5000);
		spinner.success();
		root.info("plain");
		expect(dated()).toEqual([true, true, true, false]);
	});

	test("ignores a later change to the object passed in", () => {
		const root = pretty();
		const options = { datetime: true };
		const spinner = root.options(options).info.spin("a");
		options.datetime = false;
		spinner.fail();
		expect(dated()).toEqual([true, true]);
	});

	test("keeps the scope", () => {
		const root = pretty();
		root.scope("db").options(DATED).info.spin("a", { glyph: "" }).close();
		expect(String(lines[0][0])).toMatch(/^\[INFO\] <db> \[[^\]]+\] \( \) %s$/);
	});

	test("returns the shared inert spinner on a filtered level", () => {
		const root = pretty();
		root.level = "warn";
		expect(root.options(DATED).info.spin("a")).toBe(root.info.spin("b"));
		expect(lines).toEqual([]);
	});

	test("exec dates the success and the fail line", async () => {
		const root = pretty();
		const value = await root.options(DATED).info.exec("load", async () => 42);
		await root
			.options(DATED)
			.info.exec("load", async () => {
				throw new Error("boom");
			})
			.catch(() => {});
		expect(value).toBe(42);
		expect(dated()).toEqual([true, true, true, true]);
		expect(lines[1][0]).toMatch(/\(✔\) %s$/);
		expect(lines[3][0]).toMatch(/\(✖\) %s$/);
	});

	test("exec still runs its task on a filtered level", async () => {
		const root = pretty();
		root.level = "warn";
		let ran = false;
		const value = await root.options(DATED).info.exec("load", async () => {
			ran = true;
			return 1;
		});
		expect(ran).toBe(true);
		expect(value).toBe(1);
		expect(lines).toEqual([]);
	});
});
