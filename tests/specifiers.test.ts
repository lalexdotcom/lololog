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

	test("never throw on objects that refuse conversion", () => {
		const hostile = {
			valueOf() {
				throw new Error("no");
			},
			toString() {
				throw new Error("no");
			},
		};
		expect(formatMessage(["%d %i %f", Object.create(null), hostile, hostile]).msg).toBe(
			"NaN NaN NaN",
		);
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
