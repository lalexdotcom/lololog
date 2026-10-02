import { describe, expect, test } from "@rstest/core";
import { renderJson } from "../src/renderers/json";
import { quote, renderLogfmt } from "../src/renderers/logfmt";
import type { LogRecord, SpinnerView } from "../src/renderers/record";

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

function spinning(spinner: SpinnerView, message = "load"): LogRecord {
	return record({ args: ["%s", message], spinner });
}

const running: SpinnerView = {
	id: 3,
	status: "running",
	progress: { kind: "count", done: 7, total: 120 },
	glyph: "⠋",
	color: "turquoise",
};

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

	test("omits data that JSON cannot carry", () => {
		const bare = '{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"msg":"x"}';
		expect(renderJson(record({ scope: undefined, args: ["x", undefined] }))).toEqual([bare]);
		expect(renderJson(record({ scope: undefined, args: ["x", () => {}] }))).toEqual([bare]);
	});

	test("escapes the scope and the message", () => {
		expect(renderJson(record({ scope: 'a"b', args: ['say "hi"\n\\'] }))).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"scope":"a\\"b","msg":"say \\"hi\\"\\n\\\\"}',
		]);
	});

	test("writes each record's own time, in any order", () => {
		const times = [TIME + 7, TIME + 42, TIME + 999, TIME + 1000, TIME + 61_005, TIME + 7, TIME - 1];
		const written = times.map((time) => JSON.parse(String(renderJson(record({ time }))[0])).time);
		expect(written).toEqual(times.map((time) => new Date(time).toISOString()));
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

	test("escapes other control characters as \\uXXXX", () => {
		expect(quote("a\u001Bb\u0007")).toBe('"a\\u001bb\\u0007"');
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
		expect(renderLogfmt(record({ scope: "my db", args: ["hi"] }))[0]).toContain(' scope="my db" ');
	});

	test("keeps an empty msg as an explicit empty value", () => {
		expect(renderLogfmt(record({ scope: undefined, args: [1] }))).toEqual([
			'time=2026-09-25T10:00:00.000Z level=warn severity=13 msg="" data=1',
		]);
	});
});

describe("spinner field", () => {
	test("json puts it between scope and msg", () => {
		expect(renderJson(spinning(running))).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"scope":"db","spinner":{"id":3,"status":"running","done":7,"total":120},"msg":"load"}',
		]);
	});

	test("json writes a ratio unrounded, and a bare status for an unbounded spinner", () => {
		const ratio = renderJson(
			spinning({ ...running, status: "success", progress: { kind: "ratio", ratio: 1 / 3 } }),
		);
		expect(JSON.parse(String(ratio[0])).spinner).toEqual({
			id: 3,
			status: "success",
			progress: 1 / 3,
		});
		const bare = renderJson(
			spinning({ ...running, status: "skipped", progress: { kind: "none" } }),
		);
		expect(JSON.parse(String(bare[0])).spinner).toEqual({ id: 3, status: "skipped" });
	});

	test("json keeps a message with specifiers literal", () => {
		const [line] = renderJson(spinning(running, "100% %s %d %c"));
		expect(JSON.parse(String(line)).msg).toBe("100% %s %d %c");
	});

	test("json includes the unit when the count has one", () => {
		const withUnit: SpinnerView = {
			...running,
			progress: { kind: "count", done: 7, total: 120, unit: "MB" },
		};
		expect(renderJson(spinning(withUnit))).toEqual([
			'{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"scope":"db","spinner":{"id":3,"status":"running","done":7,"total":120,"unit":"MB"},"msg":"load"}',
		]);
	});

	test("logfmt writes it as one quoted JSON value", () => {
		expect(renderLogfmt(spinning(running))).toEqual([
			'time=2026-09-25T10:00:00.000Z level=warn severity=13 scope=db spinner="{\\"id\\":3,\\"status\\":\\"running\\",\\"done\\":7,\\"total\\":120}" msg=load',
		]);
	});

	test("logfmt includes the unit when the count has one", () => {
		const withUnit: SpinnerView = {
			...running,
			progress: { kind: "count", done: 7, total: 120, unit: "MB" },
		};
		expect(renderLogfmt(spinning(withUnit))).toEqual([
			'time=2026-09-25T10:00:00.000Z level=warn severity=13 scope=db spinner="{\\"id\\":3,\\"status\\":\\"running\\",\\"done\\":7,\\"total\\":120,\\"unit\\":\\"MB\\"}" msg=load',
		]);
	});
});
