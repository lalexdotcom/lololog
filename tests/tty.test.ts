import { describe, expect, test } from "@rstest/core";
import { isTTY, noColor, noColorRequested, stdoutIsTTY } from "../src/env/tty";

function withProcess(process: object): object {
	return {
		process: { getBuiltinModule: (id: string) => (id === "node:process" ? process : undefined) },
	};
}

describe("stdoutIsTTY", () => {
	test("reads stdout.isTTY from the node:process built-in", () => {
		expect(stdoutIsTTY(withProcess({ stdout: { isTTY: true } }))).toBe(true);
		expect(stdoutIsTTY(withProcess({ stdout: {} }))).toBe(false);
	});

	test("is false without a Node process", () => {
		expect(stdoutIsTTY({})).toBe(false);
		expect(stdoutIsTTY({ process: { env: {}, browser: true } })).toBe(false);
	});
});

describe("noColorRequested", () => {
	test("is true when NO_COLOR is set to a non-empty value", () => {
		expect(noColorRequested(withProcess({ env: { NO_COLOR: "1" } }))).toBe(true);
	});

	test("is false when NO_COLOR is empty or unset", () => {
		expect(noColorRequested(withProcess({ env: { NO_COLOR: "" } }))).toBe(false);
		expect(noColorRequested(withProcess({ env: {} }))).toBe(false);
	});

	test("is false without a Node process", () => {
		expect(noColorRequested({})).toBe(false);
	});
});

describe("flags", () => {
	test("are false in the browser", () => {
		if (typeof window !== "undefined") {
			expect(isTTY).toBe(false);
			expect(noColor).toBe(false);
		} else {
			expect(typeof isTTY).toBe("boolean");
			expect(typeof noColor).toBe("boolean");
		}
	});
});
