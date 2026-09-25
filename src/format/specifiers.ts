import { serialize } from "./serialize";

export interface Message {
	msg: string;
	data: unknown;
}

function convert(specifier: string, arg: unknown): string {
	switch (specifier) {
		case "s":
			if (typeof arg === "function") return `[Function: ${arg.name || "anonymous"}]`;
			return typeof arg === "object" && arg !== null ? serialize(arg) : String(arg);
		// Number()/String() throw on a symbol, on Object.create(null), or on an object whose
		// valueOf/toString throws; util.format prints NaN for all of those.
		case "d":
			try {
				return typeof arg === "symbol" ? "NaN" : String(Number(arg));
			} catch {
				return "NaN";
			}
		case "i":
			try {
				return typeof arg === "symbol" ? "NaN" : String(Number.parseInt(String(arg), 10));
			} catch {
				return "NaN";
			}
		case "f":
			try {
				return typeof arg === "symbol" ? "NaN" : String(Number.parseFloat(String(arg)));
			} catch {
				return "NaN";
			}
		case "c":
			return "";
		default:
			return serialize(arg);
	}
}

const CONSUMING = new Set(["s", "d", "i", "f", "j", "o", "O", "c"]);

export function formatMessage(args: readonly unknown[]): Message {
	const [first] = args;
	if (typeof first !== "string") return { msg: "", data: dataOf(args) };
	let next = 1;
	let msg = "";
	let copied = 0;
	let at = first.indexOf("%");
	while (at !== -1 && at < first.length - 1) {
		const specifier = first.charAt(at + 1);
		if (specifier === "%") {
			msg += `${first.slice(copied, at)}%`;
			copied = at + 2;
		} else if (CONSUMING.has(specifier) && next < args.length) {
			msg += first.slice(copied, at) + convert(specifier, args[next++]);
			copied = at + 2;
		}
		at = first.indexOf("%", copied > at ? copied : at + 1);
	}
	msg += first.slice(copied);
	return { msg, data: dataOf(args.slice(next)) };
}

function dataOf(rest: readonly unknown[]): unknown {
	if (rest.length === 0) return undefined;
	return rest.length === 1 ? rest[0] : [...rest];
}
