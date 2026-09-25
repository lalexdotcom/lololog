import { describe, expect, test } from "@rstest/core";
import { renderBrowser } from "../src/renderers/browser";
import { renderJson } from "../src/renderers/json";
import { renderLogfmt } from "../src/renderers/logfmt";
import { renderPretty } from "../src/renderers/pretty";
import { type Format, isFormat, type Output, selectRenderer } from "../src/renderers/select";
import { renderTty } from "../src/renderers/tty";

const node = { isBrowser: false, color: true } as const;

describe("selectRenderer", () => {
	test.each<[string, Output, unknown]>([
		["browser", { isBrowser: true, tty: false, color: true, format: "json" }, renderBrowser],
		[
			"browser without colour",
			{ isBrowser: true, tty: true, color: false, format: undefined },
			renderPretty,
		],
		["auto on a TTY", { ...node, tty: true, format: undefined }, renderTty],
		["auto off a TTY", { ...node, tty: false, format: undefined }, renderJson],
		["json on a TTY", { ...node, tty: true, format: "json" }, renderJson],
		["logfmt on a TTY", { ...node, tty: true, format: "logfmt" }, renderLogfmt],
		["logfmt off a TTY", { ...node, tty: false, format: "logfmt" }, renderLogfmt],
		["pretty on a TTY", { ...node, tty: true, format: "pretty" }, renderTty],
		[
			"pretty on a TTY without colour",
			{ ...node, tty: true, color: false, format: "pretty" },
			renderPretty,
		],
		[
			"auto on a TTY without colour",
			{ ...node, tty: true, color: false, format: undefined },
			renderPretty,
		],
		["pretty off a TTY", { ...node, tty: false, format: "pretty" }, renderPretty],
	])("%s", (_, output, renderer) => {
		expect(selectRenderer(output)).toBe(renderer);
	});
});

describe("isFormat", () => {
	test("accepts the three formats only", () => {
		for (const format of ["pretty", "json", "logfmt"] satisfies Format[]) {
			expect(isFormat(format)).toBe(true);
		}
		for (const value of ["xml", "JSON", "", undefined]) expect(isFormat(value)).toBe(false);
	});
});
