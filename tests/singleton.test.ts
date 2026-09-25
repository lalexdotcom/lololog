import { describe, expect, test } from "@rstest/core";
import { shared } from "../src/singleton";

const KEY = Symbol.for("lololog-test");

describe("shared", () => {
	test("creates the value once, then returns it", () => {
		const scope = {};
		let created = 0;
		const first = shared(scope, KEY, () => ({ n: ++created }));
		expect(shared(scope, KEY, () => ({ n: ++created }))).toBe(first);
		expect(created).toBe(1);
	});

	test("returns the value another copy already stored", () => {
		const existing = { from: "first copy" };
		const scope = { [KEY]: existing };
		expect(shared(scope, KEY, () => ({ from: "second copy" }))).toBe(existing);
	});
});
