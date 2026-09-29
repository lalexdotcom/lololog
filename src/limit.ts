import { LEVEL_NAMES, LEVELS, type Level } from "./levels";

export type LimitedMethods = { [L in Level]: (...args: unknown[]) => void };

export type KeyKind = "key" | "site";

export interface LimitHost {
	passes(severity: number): boolean;
	write(level: Level, severity: number, args: unknown[]): void;
	admit(kind: KeyKind, key: string, n: number): boolean;
}

interface V8CallSite {
	getFileName(): string | null | undefined;
	getLineNumber(): number | null;
	getColumnNumber(): number | null;
}

type V8Error = ErrorConstructor & {
	stackTraceLimit?: number;
	prepareStackTrace?: (error: Error, sites: V8CallSite[]) => unknown;
};

const passSites = (_: Error, sites: V8CallSite[]) => sites;

export function callerFrame(stack: string | undefined): string | undefined {
	if (stack === undefined) return undefined;
	const lines = stack.split("\n");
	// V8 alone opens the stack with the error's own line: "Error" or "Error: message".
	// It's not a frame (doesn't start with whitespace + "at", and doesn't contain "@").
	if (/^Error/.test(lines[0])) lines.shift();
	return lines[2] || undefined;
}

// Must be called by the level method itself: the caller is read as the third frame (callSite,
// the level method, its caller).
export function callSite(): string | undefined {
	const E = Error as V8Error;
	const saved = E.stackTraceLimit;
	// Not a number: the engine does not read it (SpiderMonkey), or someone deleted it to turn stacks
	// off (V8). Setting it would leave a stray property, or turn stacks back on for everyone.
	if (typeof saved !== "number") return callerFrame(new Error().stack);
	const hadHook = Object.hasOwn(E, "prepareStackTrace");
	const savedHook = E.prepareStackTrace;
	// Three frames instead of V8's default ten: the capture costs per frame recorded.
	E.stackTraceLimit = 3;
	// V8 hands the frames over as CallSite objects instead of formatting them, and skips source
	// maps: 1.6 µs against 2.5 µs for the text stack, 4.7 µs with source maps (Node 24).
	E.prepareStackTrace = passSites;
	const stack: unknown = new Error().stack;
	if (hadHook) E.prepareStackTrace = savedHook;
	// Cast to a plain optional-property type for the delete: Node's ErrorConstructor declares
	// prepareStackTrace as required, and TS refuses `delete` through that intersection (TS2790).
	else delete (E as { prepareStackTrace?: unknown }).prepareStackTrace;
	E.stackTraceLimit = saved;
	return siteKey(stack);
}

export function siteKey(stack: unknown): string | undefined {
	// An array means the engine called the prepareStackTrace hook (V8); anything else is its
	// usual text stack, or none.
	if (!Array.isArray(stack)) return callerFrame(stack as string | undefined);
	const site = (stack as V8CallSite[])[2];
	return site === undefined
		? undefined
		: `${site.getFileName()}:${site.getLineNumber()}:${site.getColumnNumber()}`;
}

export function checkLimit(n: unknown): number {
	if (typeof n === "number" && Number.isInteger(n) && n >= 0) return n;
	throw new TypeError(`lololog: invalid limit ${String(n)}`);
}

class LimitedView {
	readonly host: LimitHost;
	readonly n: number;
	readonly key: string | undefined;
	site: string | undefined = undefined;

	constructor(host: LimitHost, n: number, key: string | undefined) {
		this.host = host;
		this.n = n;
		this.key = key;
	}
}

// On the prototype rather than own closures: `L.limit(10)` runs once per loop turn, and eleven
// closures per turn would cost more than the line they guard.
for (const level of LEVEL_NAMES) {
	const severity = LEVELS[level];
	(LimitedView.prototype as unknown as LimitedMethods)[level] = function (
		this: LimitedView,
		...args: unknown[]
	): void {
		const host = this.host;
		if (!host.passes(severity)) return;
		if (this.key !== undefined) {
			if (!host.admit("key", this.key, this.n)) return;
		} else {
			this.site ??= callSite();
			if (this.site !== undefined && !host.admit("site", this.site, this.n)) return;
		}
		host.write(level, severity, args);
	};
}

export function createLimited(host: LimitHost, n: number, key: string | undefined): LimitedMethods {
	return new LimitedView(host, n, key) as unknown as LimitedMethods;
}
