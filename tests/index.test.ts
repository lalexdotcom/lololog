import { describe, expect, test } from "@rstest/core";
import * as api from "../src/index";
import { L, LEVELS, logger } from "../src/index";

describe("public entry", () => {
	test("exports the root under a short and a long name", () => {
		expect(L).toBe(logger);
	});

	test("stores the root under Symbol.for('lololog')", () => {
		expect((globalThis as Record<symbol, unknown>)[Symbol.for("lololog")]).toBe(L);
	});

	test("exports the levels", () => {
		expect(LEVELS.warn).toBe(13);
	});

	test("exports nothing else at runtime", () => {
		expect(Object.keys(api).sort()).toEqual(["L", "LEVELS", "logger"]);
	});
});
