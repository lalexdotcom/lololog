import { LEVEL_NAMES, LEVELS, type Level } from "./levels";

export type LimitedMethods = { [L in Level]: (...args: unknown[]) => void };

export type KeyKind = "key" | "site";

export interface LimitHost {
	passes(severity: number): boolean;
	write(level: Level, severity: number, args: unknown[]): void;
	admit(kind: KeyKind, key: string, n: number): boolean;
}

type WithLimit = ErrorConstructor & { stackTraceLimit?: number };

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
	const E = Error as WithLimit;
	const saved = E.stackTraceLimit;
	// Not a number: the engine does not read it (SpiderMonkey), or someone deleted it to turn stacks
	// off (V8). Setting it would leave a stray property, or turn stacks back on for everyone.
	if (typeof saved !== "number") return callerFrame(new Error().stack);
	// Three frames instead of V8's default ten: the capture costs per frame recorded.
	E.stackTraceLimit = 3;
	const stack = new Error().stack;
	E.stackTraceLimit = saved;
	return callerFrame(stack);
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

export type Once = ((key: string) => LimitedMethods) & LimitedMethods;

export function createOnce(host: LimitHost): Once {
	const once = ((key: string) => createLimited(host, 1, key)) as Once;
	for (const level of LEVEL_NAMES) {
		const severity = LEVELS[level];
		once[level] = (...args: unknown[]) => {
			if (!host.passes(severity)) return;
			const site = callSite();
			if (site !== undefined && !host.admit("site", site, 1)) return;
			host.write(level, severity, args);
		};
	}
	return once;
}
