import { LEVEL_NAMES, type Level } from "../levels";

export const LABELS = Object.fromEntries(
	LEVEL_NAMES.map((level) => [level, level.toUpperCase()]),
) as Record<Level, string>;

let dateFormat: Intl.DateTimeFormat | undefined;

// Built on first use: constructing an Intl.DateTimeFormat costs far more than formatting.
export function formatDatetime(time: number): string {
	dateFormat ??= new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });
	return dateFormat.format(time);
}

/**
 * Concatenated to a string first argument, so console.log still reads the caller's %s/%o as
 * its format; passed on its own otherwise. `styles` are the values the prefix's own %c and %s
 * consume, so they must come right after the format, before the caller's arguments.
 */
export function prepend(
	prefix: string,
	args: readonly unknown[],
	styles: string[] = [],
): unknown[] {
	const [first, ...rest] = args;
	if (typeof first === "string") return [`${prefix} ${first}`, ...styles, ...rest];
	return [prefix, ...styles, ...args];
}
