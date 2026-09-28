import { isBrowser } from "./env/detect";
import { isTTY, noColor } from "./env/tty";
import { isLevel, LEVEL_NAMES, LEVELS, type Level } from "./levels";
import type { Renderer } from "./renderers/record";
import { type Format, isFormat, selectRenderer } from "./renderers/select";
import { consoleSink } from "./sinks/console";
import type { Sink } from "./sinks/sink";
import { nodeTerminal, type Terminal } from "./sinks/terminal";

type LevelMethod = (...args: unknown[]) => void;

type LevelMethods = { [L in Level]: LevelMethod };

export interface Logger extends LevelMethods {
	enabled: boolean;
	level: Level;
	datetime: boolean | undefined;
}

export interface RootLogger extends Logger {
	color: boolean;
	format: Format | undefined;
	scope(name: string): Logger;
}

export interface Environment {
	isBrowser: boolean;
	tty: boolean;
	noColor: boolean;
	terminal?: Terminal;
}

abstract class BaseLogger {
	#enabled = true;
	#level: Level = "wth";
	#threshold: number = LEVELS.wth;
	#datetime: boolean | undefined;

	declare wth: LevelMethod;
	declare debug: LevelMethod;
	declare verb: LevelMethod;
	declare info: LevelMethod;
	declare success: LevelMethod;
	declare notice: LevelMethod;
	declare warn: LevelMethod;
	declare error: LevelMethod;
	declare crit: LevelMethod;
	declare alert: LevelMethod;
	declare emerg: LevelMethod;

	constructor() {
		// Own closures rather than one prototype function per level: a detached
		// `promise.catch(L.error)` and `L.debug.spin` both need the method to know its logger. Not
		// a Proxy either: its trap would run on every call, filtered ones included (~20 ns against
		// ~0.3 ns measured).
		for (const level of LEVEL_NAMES) {
			const severity = LEVELS[level];
			this[level] = (...args: unknown[]) => this.write(level, severity, args);
		}
	}

	get enabled(): boolean {
		return this.#enabled;
	}

	set enabled(value: boolean) {
		this.#enabled = value;
	}

	get level(): Level {
		return this.#level;
	}

	set level(value: Level) {
		if (!isLevel(value)) throw new TypeError(`lololog: unknown level ${JSON.stringify(value)}`);
		this.#level = value;
		this.#threshold = LEVELS[value];
	}

	get datetime(): boolean | undefined {
		return this.#datetime;
	}

	set datetime(value: boolean | undefined) {
		this.#datetime = value;
	}

	accepts(severity: number): boolean {
		return this.#enabled && severity >= this.#threshold;
	}

	abstract write(level: Level, severity: number, args: unknown[]): void;
}

class ScopedLogger extends BaseLogger implements Logger {
	readonly #root: RootLoggerImpl;
	readonly #name: string;

	constructor(root: RootLoggerImpl, name: string) {
		super();
		this.#root = root;
		this.#name = name;
	}

	write(level: Level, severity: number, args: unknown[]): void {
		const root = this.#root;
		if (!root.accepts(severity) || !this.accepts(severity)) return;
		root.emit(level, this.#name, this.datetime ?? root.datetime ?? false, args);
	}
}

class RootLoggerImpl extends BaseLogger implements RootLogger {
	readonly #environment: Environment;
	readonly #scopes = new Map<string, ScopedLogger>();
	#color: boolean;
	#format: Format | undefined;
	#renderer: Renderer;
	#sink: Sink = consoleSink;

	constructor(environment: Environment) {
		super();
		this.#environment = environment;
		this.#color = !environment.noColor;
		this.#renderer = this.#select();
	}

	get color(): boolean {
		return this.#color;
	}

	set color(value: boolean) {
		this.#color = value;
		this.#renderer = this.#select();
	}

	get format(): Format | undefined {
		return this.#format;
	}

	set format(value: Format | undefined) {
		if (value !== undefined && !isFormat(value)) {
			throw new TypeError(`lololog: unknown format ${JSON.stringify(value)}`);
		}
		this.#format = value;
		this.#renderer = this.#select();
	}

	scope(name: string): Logger {
		let scoped = this.#scopes.get(name);
		if (scoped === undefined) {
			scoped = new ScopedLogger(this, name);
			this.#scopes.set(name, scoped);
		}
		return scoped;
	}

	write(level: Level, severity: number, args: unknown[]): void {
		if (this.accepts(severity)) this.emit(level, undefined, this.datetime ?? false, args);
	}

	emit(level: Level, scope: string | undefined, datetime: boolean, args: unknown[]): void {
		this.#sink.log(this.#renderer({ level, time: Date.now(), scope, datetime, args }));
	}

	#select(): Renderer {
		const { isBrowser, tty } = this.#environment;
		return selectRenderer({ isBrowser, tty, color: this.#color, format: this.#format });
	}
}

export function createRootLogger(
	environment: Environment = { isBrowser, tty: isTTY, noColor, terminal: nodeTerminal() },
): RootLogger {
	return new RootLoggerImpl(environment);
}
