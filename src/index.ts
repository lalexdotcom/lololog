import { createRootLogger, type RootLogger } from "./logger";
import { shared } from "./singleton";

export const logger: RootLogger = shared(globalThis, Symbol.for("lololog"), () =>
	createRootLogger(),
);
export const L: RootLogger = logger;

export { LEVELS, type Level } from "./levels";
export type { Logger, RootLogger } from "./logger";
export type { LogOptions } from "./overrides";
export type { Format } from "./renderers/select";
export type {
	CloseOptions,
	InitialSpinnerOptions,
	Spinner,
	SpinnerOptions,
} from "./spinner/spinner";
export type { Color } from "./style/ansi";
