// Keyed by a registered symbol, so every copy of the library loaded in one realm (two
// versions in node_modules, two bundles) shares the first copy's value.
export function shared<T>(scope: object, key: symbol, create: () => T): T {
	const registry = scope as Record<symbol, T | undefined>;
	let value = registry[key];
	if (value === undefined) {
		value = create();
		registry[key] = value;
	}
	return value;
}
