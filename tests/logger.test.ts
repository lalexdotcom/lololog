import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { LEVEL_NAMES } from "../src/levels";
import { createRootLogger, type Environment } from "../src/logger";
import { BADGES } from "../src/renderers/tty";
import { fakeTerminal } from "./fake-terminal";

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
	test("owns one method per level, bound to it", () => {
		const root = createRootLogger(PIPE);
		const db = root.scope("db");
		for (const level of LEVEL_NAMES) {
			expect(Object.hasOwn(root, level)).toBe(true);
			expect(root[level]).not.toBe(db[level]);
		}
		const { info } = root;
		info("detached");
		expect(entries()[0]).toMatchObject({ msg: "detached" });
	});

	test("can be passed as a callback", async () => {
		const db = createRootLogger(PIPE).scope("db");
		await Promise.reject(new Error("boom")).catch(db.error);
		expect(entries()[0]).toMatchObject({ level: "error", scope: "db" });
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

	test("writes to stdout instead of console.log on a TTY it can drive", () => {
		const fake = fakeTerminal();
		createRootLogger({ ...TERMINAL, terminal: fake.terminal }).info("hi");
		expect(lines).toEqual([]);
		expect(fake.out).toEqual([`${BADGES.info} hi\n`]);
	});

	test("keeps console.log for json and logfmt on a TTY, and in the browser", () => {
		const fake = fakeTerminal();
		const root = createRootLogger({ ...TERMINAL, terminal: fake.terminal });
		root.format = "json";
		root.info("a");
		root.format = "logfmt";
		root.info("b");
		createRootLogger({ isBrowser: true, tty: true, noColor: false, terminal: fake.terminal }).info(
			"c",
		);
		expect(fake.out).toEqual([]);
		expect(lines).toHaveLength(3);
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
		expect(lines).toEqual([["[INFO] <db> hi"]]);
	});

	test("resolve datetime as scope ?? root ?? false", () => {
		const root = createRootLogger(PIPE);
		root.format = "pretty";
		const db = root.scope("db");
		const dated = /^\[INFO\] <db> \[.+\] x$/;
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
