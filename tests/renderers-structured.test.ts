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
