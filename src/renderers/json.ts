import { serialize } from "../format/serialize";
import { formatMessage } from "../format/specifiers";
import { LEVELS } from "../levels";
import type { LogRecord, Renderer, SpinnerView } from "./record";

export interface SpinnerField {
	id: number;
	status: string;
	progress?: number;
	done?: number;
	total?: number;
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
	if (progress.kind === "count") return { id, status, done: progress.done, total: progress.total };
	return { id, status };
}

// Field order is output order. An undefined scope, spinner or data is dropped by JSON.stringify
// and skipped by logfmt, which is how both omit absent fields.
export function toEntry({ level, time, scope, args, spinner }: LogRecord): Entry {
	const { msg, data } = formatMessage(args);
	return {
		time: new Date(time).toISOString(),
		level,
		severity: LEVELS[level],
		scope,
		spinner: spinner === undefined ? undefined : spinnerField(spinner),
		msg,
		data,
	};
}

export const renderJson: Renderer = (record) => [serialize(toEntry(record))];
