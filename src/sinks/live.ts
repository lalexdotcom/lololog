import type { Sink } from "./sink";
import type { Terminal, TerminalStream, Write } from "./terminal";

const ESC = "\u001B[";
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches the ESC (0x1B) that starts every SGR/cursor sequence.
const ANSI = /\u001B\[[0-9;?]*[A-Za-z]/y;

// Code points, not display width: a wide character or an emoji counts one column for two, so such
// a line may still wrap and leave one line behind when the zone is erased.
export function truncate(line: string, width: number): string {
	let out = "";
	let visible = 0;
	let styled = false;
	for (let index = 0; index < line.length; ) {
		ANSI.lastIndex = index;
		const match = ANSI.exec(line);
		if (match !== null) {
			out += match[0];
			styled = true;
			index += match[0].length;
			continue;
		}
		if (visible >= width) return styled ? `${out}${ESC}0m` : out;
		const char = String.fromCodePoint(line.codePointAt(index) ?? 0);
		out += char;
		visible++;
		index += char.length;
	}
	return out;
}

// One exit listener per Terminal, not per LiveSink: RootLoggerImpl.#reselect makes a new LiveSink
// on every color/format change, and one listener per instance leaks (MaxListenersExceededWarning
// after enough toggles while a spinner runs).
const exitHooked = new WeakMap<Terminal, Set<LiveSink>>();

interface Hook {
	stream: TerminalStream;
	original: Write;
	wrapper: Write;
	active: boolean;
}

function endsLine(chunk: unknown): boolean | undefined {
	if (typeof chunk === "string") return chunk === "" ? undefined : chunk.endsWith("\n");
	if (chunk instanceof Uint8Array)
		return chunk.length === 0 ? undefined : chunk[chunk.length - 1] === 10;
	return undefined;
}

export class LiveSink implements Sink {
	readonly live = true;
	readonly #terminal: Terminal;
	readonly #colors: boolean;
	readonly #write: (text: string) => void;
	#zone: string[] = [];
	#drawn = 0;
	#active = false;
	#exitHooked = false;
	#hooks: Hook[] = [];
	#hidden = false;
	#partial = false;
	#pending = false;

	constructor(terminal: Terminal, colors: boolean) {
		this.#terminal = terminal;
		this.#colors = colors;
		const { stdout } = terminal;
		const write = stdout.write;
		this.#write = (text) => {
			if (text !== "") write.call(stdout, text);
		};
	}

	log(args: readonly unknown[], zone?: ReadonlyArray<readonly unknown[]>): void {
		const line = this.#terminal.format(args, this.#colors);
		if (zone !== undefined) this.#zone = this.#formatZone(zone);
		const lead = this.#partial ? "\n" : "";
		this.#partial = false;
		this.#hidden = false;
		this.#write(`${this.#erase()}${lead}${line}\n${this.#render()}`);
	}

	draw(zone: ReadonlyArray<readonly unknown[]>): void {
		this.#zone = this.#formatZone(zone);
		// Erased by an external write: the deferred redraw draws the new zone.
		if (this.#hidden && zone.length > 0) return;
		this.#hidden = false;
		this.#write(this.#erase() + this.#render());
	}

	dispose(): void {
		this.draw([]);
	}

	#formatZone(zone: ReadonlyArray<readonly unknown[]>): string[] {
		return zone.map((args) => this.#terminal.format(args, this.#colors));
	}

	#erase(): string {
		return this.#drawn === 0 ? "" : `${ESC}${this.#drawn}A${ESC}0J`;
	}

	// Moving the cursor up cannot reach lines already scrolled off: a zone taller than the screen
	// would redraw lower on every frame and pile copies into the scrollback.
	#visible(): string[] {
		const { columns: c, rows: r } = this.#terminal.stdout;
		// Node reports 0/0 under `script … </dev/null`; treat that like the value is missing.
		const columns = c || 80;
		const rows = r || 24;
		const room = Math.max(1, rows - 1);
		let lines = this.#zone;
		if (lines.length > room) lines = [...lines.slice(0, room - 1), `… +${lines.length - room + 1}`];
		// A zone line is one screen line by construction: a stray \r/\n would take several and
		// desync #drawn from what actually scrolled, so every later erase misses lines.
		return lines.map((line) => truncate(line.replace(/[\r\n]+/g, " "), Math.max(0, columns)));
	}

	#render(): string {
		const lines = this.#visible();
		this.#drawn = lines.length;
		let out = lines.map((line) => `${line}\n`).join("");
		if (lines.length > 0 && !this.#active) {
			this.#active = true;
			this.#hookExit();
			this.#hook();
			out = HIDE_CURSOR + out;
		} else if (lines.length === 0 && this.#active) {
			this.#active = false;
			this.#unhook();
			out += SHOW_CURSOR;
		}
		return out;
	}

	// No SIGINT listener: adding one suppresses the default exit, and a process killed by a
	// signal emits no exit event anyway.
	#hookExit(): void {
		if (this.#exitHooked) return;
		this.#exitHooked = true;
		let sinks = exitHooked.get(this.#terminal);
		if (sinks === undefined) {
			sinks = new Set<LiveSink>();
			const registered = sinks;
			exitHooked.set(this.#terminal, registered);
			this.#terminal.onExit(() => {
				for (const sink of registered) if (sink.#active) sink.#write(SHOW_CURSOR);
			});
		}
		sinks.add(this);
	}

	#hook(): void {
		for (const stream of [this.#terminal.stdout, this.#terminal.stderr]) {
			if (stream === undefined) continue;
			const original = stream.write;
			const hook: Hook = { stream, original, wrapper: original, active: true };
			hook.wrapper = (chunk, ...rest) => {
				if (!hook.active) return original.call(stream, chunk, ...rest);
				this.#external();
				const result = original.call(stream, chunk, ...rest);
				this.#settle(chunk);
				return result;
			};
			stream.write = hook.wrapper;
			this.#hooks.push(hook);
		}
	}

	#unhook(): void {
		for (const hook of this.#hooks) {
			hook.active = false;
			// Someone wrapped write after us: putting our original back would drop their wrapper.
			if (hook.stream.write === hook.wrapper) hook.stream.write = hook.original;
		}
		this.#hooks = [];
	}

	#external(): void {
		this.#write(this.#erase());
		this.#drawn = 0;
		this.#hidden = true;
	}

	// Redrawn once after the whole burst: live-region libraries emit one frame over several
	// writes, and a redraw between them would break their cursor arithmetic.
	#settle(chunk: unknown): void {
		const ends = endsLine(chunk);
		if (ends !== undefined) this.#partial = !ends;
		if (this.#partial || this.#pending) return;
		this.#pending = true;
		this.#terminal.defer(() => {
			this.#pending = false;
			if (!this.#hidden || this.#partial) return;
			this.#hidden = false;
			this.#write(this.#render());
		});
	}
}
