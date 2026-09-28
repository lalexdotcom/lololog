import type { Sink } from "./sink";
import type { Terminal } from "./terminal";

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

export class LiveSink implements Sink {
	readonly live = true;
	readonly #terminal: Terminal;
	readonly #colors: boolean;
	readonly #write: (text: string) => void;
	#zone: string[] = [];
	#drawn = 0;
	#active = false;
	#exitHooked = false;

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
		this.#write(`${this.#erase()}${line}\n${this.#render()}`);
	}

	draw(zone: ReadonlyArray<readonly unknown[]>): void {
		this.#zone = this.#formatZone(zone);
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
		const { columns = 80, rows = 24 } = this.#terminal.stdout;
		const room = Math.max(1, rows - 1);
		let lines = this.#zone;
		if (lines.length > room) lines = [...lines.slice(0, room - 1), `… +${lines.length - room + 1}`];
		return lines.map((line) => truncate(line, Math.max(0, columns)));
	}

	#render(): string {
		const lines = this.#visible();
		this.#drawn = lines.length;
		let out = lines.map((line) => `${line}\n`).join("");
		if (lines.length > 0 && !this.#active) {
			this.#active = true;
			this.#hookExit();
			out = HIDE_CURSOR + out;
		} else if (lines.length === 0 && this.#active) {
			this.#active = false;
			out += SHOW_CURSOR;
		}
		return out;
	}

	// No SIGINT listener: adding one suppresses the default exit, and a process killed by a
	// signal emits no exit event anyway.
	#hookExit(): void {
		if (this.#exitHooked) return;
		this.#exitHooked = true;
		this.#terminal.onExit(() => {
			if (this.#active) this.#write(SHOW_CURSOR);
		});
	}
}
