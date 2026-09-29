import { isBrowser } from "./env/detect";
import { isTTY, noColor } from "./env/tty";
import { isLevel, LEVEL_NAMES, LEVELS, type Level } from "./levels";
import {
	checkLimit,
	createLimited,
	type KeyKind,
	type LimitedMethods,
	type LimitHost,
} from "./limit";
import type { Renderer, SpinnerView } from "./renderers/record";
import { type Format, isFormat, selectRenderer } from "./renderers/select";
import { consoleSink } from "./sinks/console";
import { LiveSink } from "./sinks/live";
import type { Sink } from "./sinks/sink";
import { nodeTerminal, type Terminal } from "./sinks/terminal";
import { exec, type Task } from "./spinner/exec";
import {
	type InitialSpinnerOptions,
	NOOP_SPINNER,
	type Spinner,
	type SpinnerHost,
	SpinnerImpl,
	type SpinnerOrigin,
} from "./spinner/spinner";

type LevelMethod = ((...args: unknown[]) => void) & {
	spin(message: string, options?: InitialSpinnerOptions): Spinner;
	exec<T>(message: string, task: Task<T>, options?: InitialSpinnerOptions): Promise<T>;
};

type LevelMethods = { [L in Level]: LevelMethod };

export interface Logger extends LevelMethods {
	enabled: boolean;
	level: Level;
	datetime: boolean | undefined;
	limit(n: number): LimitedMethods;
	limit(key: string, n: number): LimitedMethods;
	once(key?: string): LimitedMethods;
}

export interface RootLogger extends Logger {
	color: boolean;
	format: Format | undefined;
	spinnerInterval: number | undefined;
	scope(name: string): Logger;
}

export interface Environment {
	isBrowser: boolean;
	tty: boolean;
	noColor: boolean;
	terminal?: Terminal;
}

// Periods when spinnerInterval is unset: a smooth animation in place, or a heartbeat line per
// spinner that a CI log can bear.
const LIVE_PERIOD = 80;
const LINE_PERIOD = 5000;

abstract class BaseLogger implements LimitHost {
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
			const method = ((...args: unknown[]) => this.write(level, severity, args)) as LevelMethod;
			method.spin = (message, options) => this.spin(level, severity, message, options);
			method.exec = (message, task, options) => exec(method.spin(message, options), task);
			this[level] = method;
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

	limit(n: number): LimitedMethods;
	limit(key: string, n: number): LimitedMethods;
	limit(keyOrN: string | number, n?: number): LimitedMethods {
		return typeof keyOrN === "string"
			? createLimited(this, checkLimit(n), keyOrN)
			: createLimited(this, checkLimit(keyOrN), undefined);
	}

	once(key?: string): LimitedMethods {
		return createLimited(this, 1, key);
	}

	abstract passes(severity: number): boolean;

	abstract admit(kind: KeyKind, key: string, n: number): boolean;

	abstract write(level: Level, severity: number, args: unknown[]): void;

	abstract spin(
		level: Level,
		severity: number,
		message: string,
		options: InitialSpinnerOptions | undefined,
	): Spinner;
}

class ScopedLogger extends BaseLogger implements Logger {
	readonly #root: RootLoggerImpl;
	readonly #name: string;

	constructor(root: RootLoggerImpl, name: string) {
		super();
		this.#root = root;
		this.#name = name;
	}

	passes(severity: number): boolean {
		return this.#root.accepts(severity) && this.accepts(severity);
	}

	admit(kind: KeyKind, key: string, n: number): boolean {
		return this.#root.admit(kind, key, n);
	}

	write(level: Level, severity: number, args: unknown[]): void {
		const root = this.#root;
		if (!this.passes(severity)) return;
		root.emit(level, this.#name, this.datetime ?? root.datetime ?? false, args);
	}

	spin(
		level: Level,
		severity: number,
		message: string,
		options: InitialSpinnerOptions | undefined,
	): Spinner {
		const root = this.#root;
		if (!this.passes(severity)) return NOOP_SPINNER;
		const origin = {
			level,
			scope: this.#name,
			datetime: () => this.datetime ?? root.datetime ?? false,
		};
		return root.startSpinner(origin, message, options);
	}
}

class RootLoggerImpl extends BaseLogger implements RootLogger, SpinnerHost {
	readonly #environment: Environment;
	readonly #scopes = new Map<string, ScopedLogger>();
	#color: boolean;
	#format: Format | undefined;
	#renderer: Renderer;
	#sink: Sink;
	readonly #spinners = new Set<SpinnerImpl>();
	// Collectors match a spinner's lines by this id, so it must survive the spinner leaving #spinners.
	#nextSpinnerId = 1;
	#interval: number | undefined;
	#timer: ReturnType<typeof setInterval> | undefined;
	// Apart, so an explicit key that reads like a frame line never shares a site's counter.
	readonly #counts: Record<KeyKind, Map<string, number>> = { key: new Map(), site: new Map() };

	constructor(environment: Environment) {
		super();
		this.#environment = environment;
		this.#color = !environment.noColor;
		this.#renderer = this.#pickRenderer();
		this.#sink = this.#pickSink();
	}

	get color(): boolean {
		return this.#color;
	}

	set color(value: boolean) {
		this.#color = value;
		this.#reselect();
	}

	get format(): Format | undefined {
		return this.#format;
	}

	set format(value: Format | undefined) {
		if (value !== undefined && !isFormat(value)) {
			throw new TypeError(`lololog: unknown format ${JSON.stringify(value)}`);
		}
		this.#format = value;
		this.#reselect();
	}

	scope(name: string): Logger {
		let scoped = this.#scopes.get(name);
		if (scoped === undefined) {
			scoped = new ScopedLogger(this, name);
			this.#scopes.set(name, scoped);
		}
		return scoped;
	}

	get spinnerInterval(): number | undefined {
		return this.#interval;
	}

	set spinnerInterval(value: number | undefined) {
		if (
			value !== undefined &&
			!(typeof value === "number" && Number.isFinite(value) && value >= 0)
		) {
			throw new TypeError(`lololog: invalid spinnerInterval ${String(value)}`);
		}
		// Node's setInterval clamps a delay above 2^31-1 ms to 1 ms, ticking ~1000x faster than asked.
		if (value !== undefined && value > 2 ** 31 - 1) {
			throw new TypeError(`lololog: spinnerInterval ${String(value)} exceeds setInterval's range`);
		}
		this.#interval = value;
		this.#restartTimer();
		if (this.#sink.live) this.#sink.draw(this.#zone());
	}

	spin(
		level: Level,
		severity: number,
		message: string,
		options: InitialSpinnerOptions | undefined,
	): Spinner {
		if (!this.passes(severity)) return NOOP_SPINNER;
		const origin = { level, scope: undefined, datetime: () => this.datetime ?? false };
		return this.startSpinner(origin, message, options);
	}

	startSpinner(
		origin: SpinnerOrigin,
		message: string,
		options: InitialSpinnerOptions | undefined,
	): Spinner {
		const spinner = new SpinnerImpl(this, origin, this.#nextSpinnerId++, String(message), options);
		if (this.#period() === 0) {
			this.#sink.log(this.#render(spinner, spinner.view(false), spinner.message));
			return spinner;
		}
		this.#spinners.add(spinner);
		if (this.#sink.live) this.#sink.draw(this.#zone());
		else this.#sink.log(this.#render(spinner, spinner.view(false), spinner.message));
		if (this.#spinners.size === 1) this.#restartTimer();
		return spinner;
	}

	finish(spinner: SpinnerImpl, view: SpinnerView, message: string): void {
		const running = this.#spinners.delete(spinner);
		const line = this.#render(spinner, view, message);
		if (running && this.#sink.live) this.#sink.log(line, this.#zone());
		else this.#sink.log(line);
		if (running && this.#spinners.size === 0) this.#restartTimer();
	}

	readonly #tick = (): void => {
		for (const spinner of this.#spinners) spinner.advance();
		if (this.#sink.live) this.#sink.draw(this.#zone());
		else
			for (const spinner of this.#spinners)
				this.#sink.log(this.#render(spinner, spinner.view(false), spinner.message));
	};

	#zone(): unknown[][] {
		// 0 means no live zone (per spec): drawing it here, not just skipping the timer, is what
		// lets the interval setter erase a running zone instead of leaving a frozen last frame.
		if (this.#period() === 0) return [];
		return Array.from(this.#spinners, (spinner) =>
			this.#render(spinner, spinner.view(true), spinner.message),
		);
	}

	#render(spinner: SpinnerImpl, view: SpinnerView, message: string): unknown[] {
		const { level, scope, datetime } = spinner.origin;
		// "%s" keeps the message out of the format string: a % in it stays text.
		return this.#renderer({
			level,
			time: Date.now(),
			scope,
			datetime: datetime(),
			args: ["%s", message],
			spinner: view,
		});
	}

	#period(): number {
		return this.#interval ?? (this.#sink.live ? LIVE_PERIOD : LINE_PERIOD);
	}

	#restartTimer(): void {
		if (this.#timer !== undefined) clearInterval(this.#timer);
		this.#timer = undefined;
		const period = this.#period();
		if (this.#spinners.size === 0 || period === 0) return;
		this.#timer = setInterval(this.#tick, period);
		// A forgotten spinner must not keep Node alive; browsers return a number without unref.
		(this.#timer as { unref?: () => void }).unref?.();
	}

	passes(severity: number): boolean {
		return this.accepts(severity);
	}

	admit(kind: KeyKind, key: string, n: number): boolean {
		const counts = this.#counts[kind];
		const count = counts.get(key) ?? 0;
		if (count >= n) return false;
		counts.set(key, count + 1);
		return true;
	}

	write(level: Level, severity: number, args: unknown[]): void {
		if (this.passes(severity)) this.emit(level, undefined, this.datetime ?? false, args);
	}

	emit(level: Level, scope: string | undefined, datetime: boolean, args: unknown[]): void {
		this.#sink.log(this.#renderer({ level, time: Date.now(), scope, datetime, args }));
	}

	#pickRenderer(): Renderer {
		const { isBrowser, tty } = this.#environment;
		return selectRenderer({ isBrowser, tty, color: this.#color, format: this.#format });
	}

	#pickSink(): Sink {
		const { isBrowser, tty, terminal } = this.#environment;
		const text = this.#format === undefined || this.#format === "pretty";
		return terminal !== undefined && tty && !isBrowser && text
			? new LiveSink(terminal, this.#color)
			: consoleSink;
	}

	#reselect(): void {
		this.#renderer = this.#pickRenderer();
		this.#sink.dispose();
		this.#sink = this.#pickSink();
		if (this.#sink.live && this.#spinners.size > 0) this.#sink.draw(this.#zone());
		this.#restartTimer();
	}
}

export function createRootLogger(
	environment: Environment = { isBrowser, tty: isTTY, noColor, terminal: nodeTerminal() },
): RootLogger {
	return new RootLoggerImpl(environment);
}
