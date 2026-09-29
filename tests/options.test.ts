import { describe, expect, test } from "@rstest/core";
import { checkOptions } from "../src/overrides";

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
