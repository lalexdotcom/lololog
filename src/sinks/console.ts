import type { Sink } from "./sink";

export const consoleSink: Sink = Object.freeze({
	live: false,
	log(args: readonly unknown[]) {
		console.log(...args);
	},
	draw() {},
	dispose() {},
});
