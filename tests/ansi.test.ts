import { describe, expect, test } from "@rstest/core";
import { colorize, STYLES } from "../src/style/ansi";

describe("colorize", () => {
	test("wraps text in a standard code and resets after it", () => {
		expect(colorize("x", { color: "red" })).toBe("\u001B[31mx\u001B[0m");
	});

	test("flattens extended codes and joins foreground and background in one sequence", () => {
		expect(colorize("x", { color: "white", "background-color": "orange" })).toBe(
			"\u001B[38;5;15;48;5;208mx\u001B[0m",
		);
	});

	test("leaves text untouched when the style names no color", () => {
		expect(colorize("x", {})).toBe("x");
	});
});

describe("STYLES", () => {
	test("provides lightgray as text and background", () => {
		expect(STYLES.color.lightgray).toEqual([38, 5, 252]);
		expect(STYLES["background-color"].lightgray).toEqual([48, 5, 252]);
	});

	test("draws green and grey backgrounds in the shade of their CSS namesake", () => {
		expect(STYLES["background-color"].green).toEqual([48, 5, 28]);
		expect(STYLES["background-color"].grey).toEqual([48, 5, 244]);
	});

	test("provides a dimgray background in the shade of its CSS namesake", () => {
		expect(STYLES["background-color"].dimgray).toEqual([48, 5, 242]);
	});

	test("provides turquoise as text, on the 256-colour entry nearest to CSS #40e0d0", () => {
		expect(colorize("x", { color: "turquoise" })).toBe("\u001B[38;5;80mx\u001B[0m");
	});
});
