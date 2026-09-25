import { describe, expect, test } from "@rstest/core";
import { getNodeBuiltin } from "../src/env/node-builtin";

describe("getNodeBuiltin", () => {
	test("returns undefined without a process", () => {
		expect(getNodeBuiltin("os", {})).toBeUndefined();
	});

	test("returns undefined when process has no getBuiltinModule (Node < 22.3, polyfill)", () => {
		expect(getNodeBuiltin("os", { process: { versions: {} } })).toBeUndefined();
	});

	test("asks getBuiltinModule for the node: prefixed id", () => {
		const requested: string[] = [];
		const builtin = { marker: true };
		const scope = {
			process: {
				getBuiltinModule: (id: string) => {
					requested.push(id);
					return builtin;
				},
			},
		};
		expect(getNodeBuiltin("os", scope)).toBe(builtin);
		expect(requested).toEqual(["node:os"]);
	});

	test("reaches the real os built-in in Node only", () => {
		const os = getNodeBuiltin<{ platform(): string }>("os");
		if (typeof window === "undefined") {
			expect(typeof os?.platform()).toBe("string");
		} else {
			expect(os).toBeUndefined();
		}
	});
});
