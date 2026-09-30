export interface LogOptions {
	datetime?: boolean;
}

export function checkOptions(options: unknown): LogOptions {
	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new TypeError("lololog: options must be an object");
	}
	// Plain JS gets no excess-property check: a setting that cannot be overridden (`color`) or a
	// typo (`date`) would otherwise be dropped without a word, and the line would come out unchanged.
	for (const key of Object.keys(options)) {
		if (key !== "datetime") throw new TypeError(`lololog: unknown option ${JSON.stringify(key)}`);
	}
	const { datetime } = options as LogOptions;
	if (datetime !== undefined && typeof datetime !== "boolean") {
		// Never String(datetime): "true" would read as a valid value, and an object without a
		// prototype, or with a throwing toString, would replace this TypeError with the engine's error.
		const got = typeof datetime === "string" ? JSON.stringify(datetime) : typeof datetime;
		throw new TypeError(`lololog: datetime must be a boolean, got ${got}`);
	}
	// A copy: a spinner re-reads its datetime at every frame, so the caller's object must not
	// stay reachable.
	return { datetime };
}
