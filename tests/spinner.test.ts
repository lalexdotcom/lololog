import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { createRootLogger, type Environment } from "../src/logger";
import { BADGES } from "../src/renderers/tty";
import { fakeTerminal } from "./fake-terminal";

const PIPE: Environment = { isBrowser: false, tty: false, noColor: false };
const TERMINAL: Environment = { isBrowser: false, tty: true, noColor: false };
const T = "\u001B[38;5;80m";
const GREEN = "\u001B[32m";
const R = "\u001B[0m";
const HIDE = "\u001B[?25l";
const SHOW = "\u001B[?25h";
const up = (n: number) => `\u001B[${n}A\u001B[0J`;

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

function entries(): Array<Record<string, unknown>> {
	return lines.map(([line]) => JSON.parse(String(line)));
}

function pretty() {
	const root = createRootLogger(PIPE);
	root.format = "pretty";
	return root;
}

function onTerminal() {
	const fake = fakeTerminal();
	return { fake, root: createRootLogger({ ...TERMINAL, terminal: fake.terminal }) };
}

describe("spin", () => {
	test("emits the initial line at once, at the spin level", () => {
		createRootLogger(PIPE).debug.spin("load", { total: 3 });
		expect(entries()).toEqual([
			expect.objectContaining({
				level: "debug",
				msg: "load",
				spinner: { status: "running", done: 0, total: 3 },
			}),
		]);
	});

	test("returns one frozen inert spinner when the level is filtered", () => {
		const root = createRootLogger(PIPE);
		root.level = "info";
		const a = root.debug.spin("a");
		const b = root.scope("db").debug.spin("b");
		expect(a).toBe(b);
		expect(Object.isFrozen(a)).toBe(true);
		a.update("x");
		a.success();
		rs.advanceTimersByTime(10_000);
		expect(lines).toEqual([]);
	});

	test("keeps writing after the logger's level is raised", () => {
		const root = createRootLogger(PIPE);
		const spinner = root.debug.spin("a");
		root.level = "error";
		spinner.success();
		expect(entries().map((entry) => entry.spinner)).toEqual([
			{ status: "running" },
			{ status: "success" },
		]);
	});

	test("carries the scope it came from, and works detached", () => {
		const { spin } = createRootLogger(PIPE).scope("db").info;
		spin("a");
		expect(entries()[0]).toMatchObject({ scope: "db", msg: "a" });
	});

	test("prints the message literally in every format", () => {
		const root = createRootLogger(PIPE);
		root.info.spin("100% %s %d %c");
		root.format = "pretty";
		root.info.spin("100% %s %d %c");
		expect(JSON.parse(String(lines[0]?.[0])).msg).toBe("100% %s %d %c");
		expect(lines[1]).toEqual(["[INFO] (↻) %s", "100% %s %d %c"]);
	});

	test("draws an empty glyph as a space, so its slot stays", () => {
		const root = pretty();
		root.info.spin("a", { glyph: "" });
		root.info.spin("b", { total: 4 }).success(undefined, { glyph: "" });
		expect(lines[0]).toEqual(["[INFO] ( ) %s", "a"]);
		expect(lines.at(-1)).toEqual(["[INFO]   (4/4) %s", "b"]);
	});

	test("keeps the first frame of a custom glyph off a terminal", () => {
		pretty().info.spin("a", { glyph: "◐◓◑◒" });
		rs.advanceTimersByTime(10_000);
		expect(lines.map(([format]) => format)).toEqual([
			"[INFO] (◐) %s",
			"[INFO] (◐) %s",
			"[INFO] (◐) %s",
		]);
	});
});

describe("update and heartbeat", () => {
	test("shows an update at the next tick, not before", () => {
		const spinner = createRootLogger(PIPE).info.spin("a");
		spinner.update("b", { progress: 0.5 });
		expect(lines).toHaveLength(1);
		rs.advanceTimersByTime(5000);
		expect(entries()[1]).toMatchObject({ msg: "b", spinner: { status: "running", progress: 0.5 } });
	});

	test("keeps the progress when an update carries none", () => {
		const spinner = createRootLogger(PIPE).info.spin("a", { total: 10 });
		spinner.update({ done: 4, total: 10 });
		spinner.update("b");
		spinner.update({ color: "red" });
		(spinner.update as () => void)();
		rs.advanceTimersByTime(5000);
		expect(entries()[1]).toMatchObject({
			msg: "b",
			spinner: { status: "running", done: 4, total: 10 },
		});
	});

	test("writes every spinner at every tick off a terminal, changed or not", () => {
		const root = createRootLogger(PIPE);
		root.info.spin("a");
		root.warn.spin("b");
		rs.advanceTimersByTime(4999);
		expect(lines).toHaveLength(2);
		rs.advanceTimersByTime(1);
		expect(entries().map((entry) => entry.msg)).toEqual(["a", "b", "a", "b"]);
	});
});

describe("ending", () => {
	test("success fills the progress, fail keeps the last one, both default to the last message", () => {
		const root = createRootLogger(PIPE);
		const ok = root.info.spin("a", { total: 10 });
		ok.update({ done: 4, total: 10 });
		ok.success("done");
		const ko = root.info.spin("b", { total: 10 });
		ko.update({ done: 4, total: 10 });
		ko.fail();
		expect(entries().map(({ msg, spinner }) => ({ msg, spinner }))).toEqual([
			{ msg: "a", spinner: { status: "running", done: 0, total: 10 } },
			{ msg: "done", spinner: { status: "success", done: 10, total: 10 } },
			{ msg: "b", spinner: { status: "running", done: 0, total: 10 } },
			{ msg: "b", spinner: { status: "fail", done: 4, total: 10 } },
		]);
	});

	test("close takes a free status, closed by default, and never running", () => {
		const root = createRootLogger(PIPE);
		root.info.spin("a").close();
		root.info.spin("b").close("skipped", { status: "skipped" });
		root.info.spin("c").close(undefined, { status: "running" });
		expect(
			entries()
				.filter((_, index) => index % 2 === 1)
				.map((entry) => entry.spinner),
		).toEqual([{ status: "closed" }, { status: "skipped" }, { status: "closed" }]);
	});

	test("draws the method's defaults, which options override", () => {
		const root = pretty();
		root.info.spin("a").close("x", { status: "success" });
		root.info.spin("b").success("y", { glyph: "★" });
		root.info.spin("c").fail("z");
		expect(lines.filter((_, index) => index % 2 === 1)).toEqual([
			["[INFO] (●) %s", "x"],
			["[INFO] (★) %s", "y"],
			["[INFO] (✖) %s", "z"],
		]);
	});

	test("ignores every call after the end, and stops the heartbeat", () => {
		const spinner = createRootLogger(PIPE).info.spin("a");
		spinner.success();
		spinner.fail();
		spinner.update("x");
		spinner.close();
		rs.advanceTimersByTime(20_000);
		expect(lines).toHaveLength(2);
	});

	test("works with detached methods, printing an error passed to fail", async () => {
		const spinner = createRootLogger(PIPE).info.spin("a");
		await Promise.reject(new Error("boom")).then(spinner.success, spinner.fail);
		expect(entries()[1]).toMatchObject({ msg: "Error: boom", spinner: { status: "fail" } });
	});
});

describe("spinnerInterval", () => {
	test("accepts undefined or a finite number >= 0", () => {
		const root = createRootLogger(PIPE);
		for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "80"]) {
			expect(() => {
				(root as { spinnerInterval: unknown }).spinnerInterval = bad;
			}).toThrow(TypeError);
		}
		root.spinnerInterval = 0;
		root.spinnerInterval = undefined;
		expect(root.spinnerInterval).toBeUndefined();
	});

	test("rejects a delay above what setInterval can hold without clamping", () => {
		const root = createRootLogger(PIPE);
		expect(() => {
			root.spinnerInterval = 2 ** 31;
		}).toThrow(TypeError);
		root.spinnerInterval = 2 ** 31 - 1;
		expect(root.spinnerInterval).toBe(2 ** 31 - 1);
	});

	test("0 writes the initial and final lines only", () => {
		const root = createRootLogger(PIPE);
		root.spinnerInterval = 0;
		const spinner = root.info.spin("a");
		rs.advanceTimersByTime(60_000);
		spinner.success();
		expect(lines).toHaveLength(2);
	});

	test("takes effect on running spinners", () => {
		const root = createRootLogger(PIPE);
		root.info.spin("a");
		root.spinnerInterval = 1000;
		rs.advanceTimersByTime(1000);
		expect(lines).toHaveLength(2);
	});
});

describe("on a terminal", () => {
	test("animates at the bottom, every 80 ms", () => {
		const { fake, root } = onTerminal();
		root.info.spin("load");
		rs.advanceTimersByTime(80);
		expect(fake.out).toEqual([
			`${HIDE}${BADGES.info} ${T}(⠋)${R} load\n`,
			`${up(1)}${BADGES.info} ${T}(⠙)${R} load\n`,
		]);
	});

	test("writes ordinary logs above the zone", () => {
		const { fake, root } = onTerminal();
		root.info.spin("load");
		root.warn("hey");
		expect(fake.out[1]).toBe(`${up(1)}${BADGES.warn} hey\n${BADGES.info} ${T}(⠋)${R} load\n`);
	});

	test("turns a finished spinner into an ordinary line", () => {
		const { fake, root } = onTerminal();
		root.info.spin("load").success();
		expect(fake.out[1]).toBe(`${up(1)}${BADGES.info} ${GREEN}(✔)${R} load\n${SHOW}`);
	});

	test("cycles a custom glyph and restarts it when given again", () => {
		const { fake, root } = onTerminal();
		const spinner = root.info.spin("a", { glyph: "ab" });
		rs.advanceTimersByTime(160);
		spinner.update({ glyph: "xy" });
		rs.advanceTimersByTime(160);
		const glyphs = fake.out.map((text) => /\((.)\)/.exec(text)?.[1]);
		expect(glyphs).toEqual(["a", "b", "a", "x", "y"]);
	});

	test("draws a static line when spinnerInterval is 0", () => {
		const { fake, root } = onTerminal();
		root.spinnerInterval = 0;
		root.info.spin("a");
		rs.advanceTimersByTime(1000);
		expect(fake.out).toEqual([`${BADGES.info} ${T}(↻)${R} a\n`]);
	});

	test("spinnerInterval = 0 clears a running zone instead of freezing it, and resumes after", () => {
		const { fake, root } = onTerminal();
		const spinner = root.info.spin("a");
		root.spinnerInterval = 0;
		expect(fake.out.at(-1)).toBe(`${up(1)}${SHOW}`);
		root.warn("x");
		expect(fake.out.at(-1)).toBe(`${BADGES.warn} x\n`);
		spinner.success();
		expect(fake.out.at(-1)).toBe(`${BADGES.info} ${GREEN}(✔)${R} a\n`);
		root.spinnerInterval = undefined;
		root.info.spin("b");
		expect(fake.out.at(-1)).toBe(`${HIDE}${BADGES.info} ${T}(⠋)${R} b\n`);
	});

	test("leaves the terminal when the format changes, and carries on in the new format", () => {
		const { fake, root } = onTerminal();
		root.info.spin("a");
		root.format = "json";
		expect(fake.out.at(-1)).toBe(`${up(1)}${SHOW}`);
		rs.advanceTimersByTime(5000);
		expect(entries()).toEqual([
			expect.objectContaining({ msg: "a", spinner: { status: "running" } }),
		]);
	});
});
