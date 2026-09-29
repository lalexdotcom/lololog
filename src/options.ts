import { LEVEL_NAMES, LEVELS, type Level } from "./levels";
import type { LimitHost } from "./limit";
import type { LevelMethod, LevelMethods } from "./logger";
import type { LogOptions } from "./overrides";
import { exec } from "./spinner/exec";
import type { InitialSpinnerOptions, Spinner } from "./spinner/spinner";

export type OptionsMethods = LevelMethods;

export interface OptionsHost extends LimitHost {
	spin(
		level: Level,
		severity: number,
		message: string,
		options: InitialSpinnerOptions | undefined,
		overrides?: LogOptions,
	): Spinner;
}

export class OptionsView {
	readonly host: OptionsHost;
	readonly overrides: LogOptions;

	constructor(host: OptionsHost, overrides: LogOptions) {
		this.host = host;
		this.overrides = overrides;
	}
}

// Getters, not prototype functions: in `view.info.spin(…)` the spin closure must reach the view,
// and a function shared on the prototype only sees `view.info` as `this`. Not closures built in
// the constructor either: `L.options(o)` runs once per call, and only the level read pays here.
for (const level of LEVEL_NAMES) {
	const severity = LEVELS[level];
	Object.defineProperty(OptionsView.prototype, level, {
		get(this: OptionsView): LevelMethod {
			const { host, overrides } = this;
			const method = ((...args: unknown[]) =>
				host.write(level, severity, args, overrides)) as LevelMethod;
			method.spin = (message, options) => host.spin(level, severity, message, options, overrides);
			method.exec = (message, task, options) => exec(method.spin(message, options), task);
			return method;
		},
	});
}

export function createOptions(host: OptionsHost, overrides: LogOptions): OptionsMethods {
	return new OptionsView(host, overrides) as unknown as OptionsMethods;
}
