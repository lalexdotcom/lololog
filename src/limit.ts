import { LEVEL_NAMES, LEVELS, type Level } from "./levels";
import type { LogOptions } from "./overrides";

export type LimitedMethods = { [L in Level]: (...args: unknown[]) => void };

export type KeyKind = "key" | "site";

export interface LimitHost {
	passes(severity: number): boolean;
	write(level: Level, severity: number, args: unknown[], overrides?: LogOptions): void;
	admit(kind: KeyKind, key: string, n: number): boolean;
}

interface V8CallSite {
	getFileName(): string | null | undefined;
	getLineNumber(): number | null;
	getColumnNumber(): number | null;
	isNative?(): boolean;
}

type V8Error = ErrorConstructor & {
	stackTraceLimit?: number;
	prepareStackTrace?: (error: Error, sites: V8CallSite[]) => unknown;
};

// Three frames instead of V8's default ten: the capture costs per frame recorded. The deeper
// capture runs only when the caller's slot held native frames only (see callerFrame), which V8 and
// SpiderMonkey never produce: they keep the three-frame cost.
const DEPTHS = [3, 10];

const passSites = (_: Error, sites: V8CallSite[]) => sites;

// null: the caller's slot and every frame after it are native. A tail call (JavaScriptCore, strict
// mode) dropped the caller's frame, leaving the native function that called it back (forEach); a
// deeper capture reaches the line that called that function.
export function callerFrame(stack: string | undefined): string | null | undefined {
	if (stack === undefined) return undefined;
	const lines = stack.split("\n");
	// V8 alone opens the stack with the error's own line: "Error" or "Error: message".
	if (/^Error/.test(lines[0])) lines.shift();
	if (!lines[2]) return undefined;
	for (let i = 2; lines[i]; i++) if (!lines[i].includes("[native code]")) return lines[i];
	return null;
}

// Must be called by the level method itself: the caller is read as the third frame (callSite,
// the level method, its caller).
export function callSite(): string | undefined {
	const E = Error as V8Error;
	const saved = E.stackTraceLimit;
	// Not a number: the engine does not read it (SpiderMonkey), or someone deleted it to turn stacks
	// off (V8). Setting it would leave a stray property, or turn stacks back on for everyone.
	if (typeof saved !== "number") return callerFrame(new Error().stack) ?? undefined;
	const hadHook = Object.hasOwn(E, "prepareStackTrace");
	const savedHook = E.prepareStackTrace;
	// V8 hands the frames over as CallSite objects instead of formatting them, and skips source
	// maps: 1.6 µs against 2.5 µs for the text stack, 4.7 µs with source maps (Node 24).
	E.prepareStackTrace = passSites;
	let key: string | null | undefined;
	try {
		for (const depth of DEPTHS) {
			E.stackTraceLimit = depth;
			// The capture itself can throw (a hostile `stack` getter, a stack overflow unwinding
			// through here): both globals must come back regardless, or every later capture in the
			// process breaks.
			key = siteKey(new Error().stack);
			if (key !== null) break;
		}
	} finally {
		if (hadHook) E.prepareStackTrace = savedHook;
		// Cast to a plain optional-property type for the delete: Node's ErrorConstructor declares
		// prepareStackTrace as required, and TS refuses `delete` through that intersection (TS2790).
		else delete (E as { prepareStackTrace?: unknown }).prepareStackTrace;
		E.stackTraceLimit = saved;
	}
	return key ?? undefined;
}

export function siteKey(stack: unknown): string | null | undefined {
	// An array means the engine called the prepareStackTrace hook (V8); anything else is its
	// usual text stack, or none. null as in callerFrame: only native frames from the caller's slot.
	if (!Array.isArray(stack)) return typeof stack === "string" ? callerFrame(stack) : undefined;
	const sites = stack as V8CallSite[];
	if (sites.length < 3) return undefined;
	for (let i = 2; i < sites.length; i++) {
		const site = sites[i];
		if (site.isNative?.()) continue;
		const file = site.getFileName();
		// eval'd code (e.g. webpack's default dev `devtool`) has no file name; String(site) keeps the
		// origin ("inner (webpack://app/./src/a.js:1:27)") instead of collapsing every eval to one key.
		return file == null
			? String(site)
			: `${file}:${site.getLineNumber()}:${site.getColumnNumber()}`;
	}
	return null;
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
