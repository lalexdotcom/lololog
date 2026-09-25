import type { Style } from "./style/ansi";

// Frozen: a runtime mutation here would desync the level setter's threshold
// and the json `severity` field from the severities bound into level methods at load.
export const LEVELS = Object.freeze({
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
} as const);

export type Level = keyof typeof LEVELS;

export const LEVEL_NAMES = Object.keys(LEVELS) as Level[];

export const LEVEL_STYLES = {
	wth: { color: "black", "background-color": "lightgray" },
	debug: { color: "black", "background-color": "yellow" },
	verb: { color: "white", "background-color": "mediumpurple" },
	// dimgray, not grey: white on grey is 3.9:1, under the 4.5:1 below which VS Code's terminal
	// repaints the text dark.
	info: { color: "white", "background-color": "dimgray" },
	success: { color: "white", "background-color": "green" },
	notice: { color: "white", "background-color": "blue" },
	warn: { color: "black", "background-color": "orange" },
	error: { color: "white", "background-color": "red" },
	crit: { color: "white", "background-color": "red" },
	alert: { color: "white", "background-color": "red" },
	emerg: { color: "white", "background-color": "red" },
} as const satisfies Record<Level, Required<Style>>;

export function isLevel(value: unknown): value is Level {
	return typeof value === "string" && Object.hasOwn(LEVELS, value);
}
