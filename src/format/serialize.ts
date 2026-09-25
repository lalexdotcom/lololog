function normalize(value: unknown, ancestors: object[]): unknown {
	if (typeof value === "bigint") return value.toString();
	if (typeof value !== "object" || value === null) return value;
	// Ancestors, not every object seen: an object referenced twice without a cycle is data.
	if (ancestors.includes(value)) return "[Circular]";
	ancestors.push(value);
	try {
		if (value instanceof Error) {
			const error: Record<string, unknown> = {
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
			if (value.cause !== undefined) error.cause = normalize(value.cause, ancestors);
			return error;
		}
		const { toJSON } = value as { toJSON?: unknown };
		if (typeof toJSON === "function") return normalize(toJSON.call(value), ancestors);
		if (Array.isArray(value)) return value.map((item) => normalize(item, ancestors));
		const plain: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) plain[key] = normalize(item, ancestors);
		return plain;
	} catch {
		// A throwing getter or toJSON must not turn a log call into an exception.
		return "[Unserializable]";
	} finally {
		ancestors.pop();
	}
}

// "undefined" where JSON.stringify returns nothing (undefined, a function, a symbol), as
// util.format's %j does, so callers always get text.
export function serialize(value: unknown): string {
	return JSON.stringify(normalize(value, [])) ?? "undefined";
}
