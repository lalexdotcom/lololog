import { describe, expect, test } from "@rstest/core";
import { isLevel, LEVEL_NAMES, LEVEL_STYLES, LEVELS } from "../src/levels";

describe("LEVELS", () => {
	test("carries the OpenTelemetry severity numbers", () => {
		expect(LEVELS).toEqual({
			wth: 1,
			debug: 5,
			verb: 8,
			info: 9,
			success: 10,
			notice: 11,
			warn: 13,
			error: 17,
			crit: 20,
			alert: 22,
			emerg: 24,
		});
	});

	test("lists the names by increasing severity", () => {
		const severities = LEVEL_NAMES.map((level) => LEVELS[level]);
		expect(severities).toEqual([...severities].sort((a, b) => a - b));
	});

	test("is frozen", () => {
		expect(Object.isFrozen(LEVELS)).toBe(true);
	});
});

describe("LEVEL_STYLES", () => {
	test("styles every level", () => {
		expect(Object.keys(LEVEL_STYLES)).toEqual(LEVEL_NAMES);
	});

	test("paints every error level white on red", () => {
		for (const level of ["error", "crit", "alert", "emerg"] as const) {
			expect(LEVEL_STYLES[level]).toEqual({ color: "white", "background-color": "red" });
		}
	});
});

describe("isLevel", () => {
	test("accepts the canonical keys", () => {
		for (const level of LEVEL_NAMES) expect(isLevel(level)).toBe(true);
	});

	test("rejects aliases, inherited keys, other cases and non-strings", () => {
		for (const value of ["warning", "toString", "INFO", 9, undefined]) {
			expect(isLevel(value)).toBe(false);
		}
	});
});
