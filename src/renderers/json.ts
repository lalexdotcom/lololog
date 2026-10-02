import { isoTime } from "../format/iso";
import { stringify } from "../format/serialize";
import { formatMessage } from "../format/specifiers";
import { LEVEL_NAMES, LEVELS, type Level } from "../levels";
import type { LogRecord, Renderer, SpinnerView } from "./record";

export interface SpinnerField {
	id: number;
	status: string;
	progress?: number;
	done?: number;
	total?: number;
	unit?: string;
}

export interface Entry {
	time: string;
	level: string;
	severity: number;
	scope: string | undefined;
	spinner: SpinnerField | undefined;
	msg: string;
	data: unknown;
}

function spinnerField({ id, status, progress }: SpinnerView): SpinnerField {
	if (progress.kind === "ratio") return { id, status, progress: progress.ratio };
	if (progress.kind === "count") {
		const { done, total, unit } = progress;
		return unit === undefined ? { id, status, done, total } : { id, status, done, total, unit };
	}
	return { id, status };
}

// Field order is logfmt's output order, and the one renderJson writes by hand below. logfmt
// skips an undefined scope, spinner or data.
export function toEntry({ level, time, scope, args, spinner }: LogRecord): Entry {
	const { msg, data } = formatMessage(args);
	return {
		time: isoTime(time),
		level,
		severity: LEVELS[level],
		scope,
		spinner: spinner === undefined ? undefined : spinnerField(spinner),
		msg,
		data,
	};
}

const LEVEL_FRAGMENTS = Object.fromEntries(
	LEVEL_NAMES.map((level) => [level, `,"level":"${level}","severity":${LEVELS[level]}`]),
) as Record<Level, string>;

const scopeFragments = new Map<string, string>();

function scopeFragment(scope: string): string {
	let fragment = scopeFragments.get(scope);
	if (fragment === undefined) {
		fragment = `,"scope":${JSON.stringify(scope)}`;
		scopeFragments.set(scope, fragment);
	}
	return fragment;
}

// The line is concatenated, not JSON.stringify'd from an Entry: building the object and
// copying it through serialize's normalize cost about 410 ns a line (Node 24). Only data,
// the one field of unknown shape, still goes through it.
export const renderJson: Renderer = ({ level, time, scope, args, spinner }) => {
	const { msg, data } = formatMessage(args);
	let line = `{"time":"${isoTime(time)}"${LEVEL_FRAGMENTS[level]}`;
	if (scope !== undefined) line += scopeFragment(scope);
	if (spinner !== undefined) line += `,"spinner":${JSON.stringify(spinnerField(spinner))}`;
	line += `,"msg":${JSON.stringify(msg)}`;
	// undefined for a function or a symbol too, which JSON has no value for.
	const json = data === undefined ? undefined : stringify(data);
	if (json !== undefined) line += `,"data":${json}`;
	return [`${line}}`];
};
