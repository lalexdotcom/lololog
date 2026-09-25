import { serialize } from "../format/serialize";
import { toEntry } from "./json";
import type { Renderer } from "./record";

const NEEDS_QUOTES = /[ "=\p{Cc}]/u;
const ESCAPES: Record<string, string> = {
	"\\": "\\\\",
	'"': '\\"',
	"\n": "\\n",
	"\r": "\\r",
	"\t": "\\t",
};

export function quote(value: string): string {
	if (value !== "" && !NEEDS_QUOTES.test(value)) return value;
	return `"${value.replace(/[\\"\n\r\t]/g, (char) => ESCAPES[char] ?? char)}"`;
}

export const renderLogfmt: Renderer = (record) => {
	const entry = toEntry(record);
	let line = `time=${entry.time} level=${entry.level} severity=${entry.severity}`;
	if (entry.scope !== undefined) line += ` scope=${quote(entry.scope)}`;
	line += ` msg=${quote(entry.msg)}`;
	if (entry.data !== undefined) line += ` data=${quote(serialize(entry.data))}`;
	return [line];
};
