export interface Sink {
	readonly live: boolean;
	/** Writes one line; a live sink then redraws its zone below it, replaced by `zone` if given. */
	log(args: readonly unknown[], zone?: ReadonlyArray<readonly unknown[]>): void;
	/** Replaces and redraws the lines pinned at the bottom; nothing to pin on a console. */
	draw(zone: ReadonlyArray<readonly unknown[]>): void;
	dispose(): void;
}
