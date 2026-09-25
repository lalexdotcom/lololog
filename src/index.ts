import { createRootLogger, type RootLogger } from "./logger";
import { shared } from "./singleton";

export const logger: RootLogger = shared(globalThis, Symbol.for("lololog"), () =>
	createRootLogger(),
);
export const L: RootLogger = logger;

export { LEVELS, type Level } from "./levels";
export type { Logger, RootLogger } from "./logger";
export type { Format } from "./renderers/select";
