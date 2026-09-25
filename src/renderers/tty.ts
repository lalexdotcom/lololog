import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { colorize } from "../style/ansi";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer } from "./record";

const WIDTH = Math.max(...LEVEL_NAMES.map((level) => level.length)) + 2;

export function center(text: string, width: number): string {
	const left = Math.floor((width - text.length) / 2);
	return " ".repeat(left) + text + " ".repeat(width - text.length - left);
}

export const BADGES = Object.fromEntries(
	LEVEL_NAMES.map((level) => [level, colorize(center(LABELS[level], WIDTH), LEVEL_STYLES[level])]),
) as Record<Level, string>;

// Bounded: the root caches scopes by name, so this holds one entry per scope ever created.
const scopeLabels = new Map<string, string>();

function scopeLabel(scope: string): string {
	let label = scopeLabels.get(scope);
	if (label === undefined) {
		label = colorize(`<${scope}>`, { color: "grey" });
		scopeLabels.set(scope, label);
	}
	return label;
}

export const renderTty: Renderer = ({ level, time, scope, datetime, args }) => {
	let prefix = BADGES[level];
	if (scope !== undefined) prefix += ` ${scopeLabel(scope)}`;
	if (datetime) prefix += ` ${colorize(`[${formatDatetime(time)}]`, { color: "lightgray" })}`;
	return prepend(prefix, args);
};
