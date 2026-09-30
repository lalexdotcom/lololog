import { describe, expect, test } from "@rstest/core";
import { serialize, stringify } from "../src/format/serialize";

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

describe("stringify", () => {
	test("writes what serialize writes for a value JSON can carry", () => {
		const node: Record<string, unknown> = { a: 1n };
		node.self = node;
		expect(stringify(node)).toBe('{"a":"1","self":"[Circular]"}');
	});

	test("returns undefined where JSON has no value", () => {
		expect(stringify(undefined)).toBeUndefined();
		expect(stringify(() => 1)).toBeUndefined();
		expect(stringify(Symbol("s"))).toBeUndefined();
	});
});
