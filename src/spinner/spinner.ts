import type { Level } from "../levels";
import type { SpinnerView } from "../renderers/record";
import type { Color } from "../style/ansi";
import { frameAt, splitFrames } from "./glyph";
import { completed, NO_PROGRESS, nextProgress, type Progress } from "./progress";

export type SpinnerStyle = { glyph?: string; color?: Color };

type SpinnerProgress =
	| { progress: number; done?: never; total?: never }
	| { done: number; total: number; progress?: never };

type NoProgress = { progress?: never; done?: never; total?: never };

// The never guards reject { progress, total }: excess-property checking on a non-discriminated
// union accepts any key known to one of its members.
export type SpinnerOptions = SpinnerStyle & (SpinnerProgress | NoProgress);

export type InitialSpinnerOptions =
	| SpinnerOptions
	| (SpinnerStyle & { total: number; progress?: never });

export type CloseOptions = SpinnerOptions & { status?: string };

export interface Spinner {
	update(message: string, options?: SpinnerOptions): void;
	update(options: SpinnerOptions): void;
	close(message?: string, options?: CloseOptions): void;
	success(message?: string, options?: CloseOptions): void;
	fail(message?: string, options?: CloseOptions): void;
}

export interface SpinnerOrigin {
	level: Level;
	scope: string | undefined;
	datetime(): boolean;
}

export interface SpinnerHost {
	finish(spinner: SpinnerImpl, view: SpinnerView, message: string): void;
}

interface Ending {
	glyph: string;
	color: Color | undefined;
	status: string;
	fill: boolean;
}

const CLOSED: Ending = { glyph: "●", color: undefined, status: "closed", fill: false };
const SUCCEEDED: Ending = { glyph: "✔", color: "green", status: "success", fill: true };
const FAILED: Ending = { glyph: "✖", color: "red", status: "fail", fill: false };

// An empty glyph keeps its slot, so parentheses and bars stay where they were.
const BLANK = " ";

export const NOOP_SPINNER: Spinner = Object.freeze({
	update() {},
	close() {},
	success() {},
	fail() {},
});

export class SpinnerImpl implements Spinner {
	readonly origin: SpinnerOrigin;
	readonly id: number;
	message: string;
	readonly #host: SpinnerHost;
	#progress: Progress = NO_PROGRESS;
	#frames: string[] | undefined;
	#index = 0;
	// A new glyph shows its first frame at the next tick instead of skipping it.
	#restarted = false;
	#color: Color | undefined = "turquoise";
	#ended = false;

	constructor(
		host: SpinnerHost,
		origin: SpinnerOrigin,
		id: number,
		message: string,
		options: InitialSpinnerOptions | undefined,
	) {
		this.#host = host;
		this.origin = origin;
		this.id = id;
		this.message = message;
		this.#apply(options);
		// The initial line already showed frame 0.
		this.#restarted = false;
	}

	// Arrow fields, not methods: `task.then(spinner.success, spinner.fail)` passes them detached.
	readonly update = (first?: string | SpinnerOptions, second?: SpinnerOptions): void => {
		if (this.#ended) return;
		if (typeof first === "string") {
			this.message = first;
			this.#apply(second);
		} else {
			this.#apply(first);
		}
	};

	readonly close = (message?: string, options?: CloseOptions): void => {
		this.#end(CLOSED, message, options);
	};

	readonly success = (message?: string, options?: CloseOptions): void => {
		this.#end(SUCCEEDED, message, options);
	};

	readonly fail = (message?: string, options?: CloseOptions): void => {
		this.#end(FAILED, message, options);
	};

	advance(): void {
		if (this.#restarted) this.#restarted = false;
		else this.#index++;
	}

	view(live: boolean): SpinnerView {
		return {
			id: this.id,
			status: "running",
			progress: this.#progress,
			glyph: frameAt(this.#frames, this.#index, live),
			color: this.#color,
		};
	}

	#apply(options: InitialSpinnerOptions | undefined): void {
		if (options == null) return;
		this.#progress = nextProgress(this.#progress, options);
		if (options.glyph !== undefined) {
			const frames = splitFrames(options.glyph);
			this.#frames = frames.length > 0 ? frames : [BLANK];
			this.#index = 0;
			this.#restarted = true;
		}
		if (options.color !== undefined) this.#color = options.color;
	}

	#end(ending: Ending, message: string | undefined, options: CloseOptions | undefined): void {
		if (this.#ended) return;
		this.#ended = true;
		const given = options?.progress !== undefined || options?.total !== undefined;
		const progress = nextProgress(this.#progress, options);
		const requested = options?.status ?? ending.status;
		const glyph =
			options?.glyph === undefined ? ending.glyph : (splitFrames(options.glyph)[0] ?? BLANK);
		this.#host.finish(
			this,
			{
				id: this.id,
				status: requested === "running" ? "closed" : requested,
				progress: ending.fill && !given ? completed(progress) : progress,
				glyph,
				color: options?.color ?? ending.color,
			},
			message === undefined ? this.message : String(message),
		);
	}
}
