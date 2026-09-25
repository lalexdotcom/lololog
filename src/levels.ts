import type { Style } from "./style/ansi";

export const LEVELS = {
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
} as const;

export type Level = keyof typeof LEVELS;

export const LEVEL_NAMES = Object.keys(LEVELS) as Level[];

export const LEVEL_STYLES = {
	wth: { color: "black", "background-color": "lightgray" },
	debug: { color: "black", "background-color": "yellow" },
	verb: { color: "white", "background-color": "mediumpurple" },
	info: { color: "white", "background-color": "grey" },
	success: { color: "white", "background-color": "green" },
	notice: { color: "white", "background-color": "blue" },
	warn: { color: "white", "background-color": "orange" },
	error: { color: "white", "background-color": "red" },
	crit: { color: "white", "background-color": "red" },
	alert: { color: "white", "background-color": "red" },
	emerg: { color: "white", "background-color": "red" },
} as const satisfies Record<Level, Required<Style>>;

export function isLevel(value: unknown): value is Level {
	return typeof value === "string" && Object.hasOwn(LEVELS, value);
}
