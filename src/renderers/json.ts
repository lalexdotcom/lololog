import { serialize } from "../format/serialize";
import { formatMessage } from "../format/specifiers";
import { LEVELS } from "../levels";
import type { LogRecord, Renderer } from "./record";

export interface Entry {
	time: string;
	level: string;
	severity: number;
	scope: string | undefined;
	msg: string;
	data: unknown;
}

// Field order is output order. An undefined scope or data is dropped by JSON.stringify and
// skipped by logfmt, which is how both omit absent fields.
export function toEntry({ level, time, scope, args }: LogRecord): Entry {
	const { msg, data } = formatMessage(args);
	return { time: new Date(time).toISOString(), level, severity: LEVELS[level], scope, msg, data };
}

export const renderJson: Renderer = (record) => [serialize(toEntry(record))];
