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
