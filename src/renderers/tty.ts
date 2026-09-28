import { LEVEL_NAMES, LEVEL_STYLES, type Level } from "../levels";
import { filled, progressLabel, ratioOf } from "../spinner/progress";
import { type Color, colorize } from "../style/ansi";
import { formatDatetime, LABELS, prepend } from "./prefix";
import type { Renderer, SpinnerView } from "./record";

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
		label = colorize(` <${scope}> `, LEVEL_STYLES.wth);
		scopeLabels.set(scope, label);
	}
	return label;
}

function paint(text: string, color: Color | undefined): string {
	return color === undefined || text === "" ? text : colorize(text, { color });
}

export function ttyIndicator({ status, progress, glyph, color }: SpinnerView): string {
	if (progress.kind === "none") return paint(`(${glyph})`, color);
	const ended = status !== "running";
	// The final glyph and its space take the two cells the bar gives up, so a spinner's running
	// and final lines keep the same width.
	const width = ended ? 8 : 10;
	const cells = filled(ratioOf(progress), width);
	const bar = paint("━".repeat(cells), color) + paint("─".repeat(width - cells), "lightgray");
	const text = `${bar} ${progressLabel(progress, true)}`;
	return ended ? `${paint(glyph, color)} ${text}` : text;
}

export const renderTty: Renderer = ({ level, time, scope, datetime, args, spinner }) => {
	let prefix = BADGES[level];
	if (scope !== undefined) prefix += ` ${scopeLabel(scope)}`;
	if (datetime) prefix += ` ${colorize(`[${formatDatetime(time)}]`, { color: "lightgray" })}`;
	if (spinner !== undefined) prefix += ` ${ttyIndicator(spinner)}`;
	return prepend(prefix, args);
};
