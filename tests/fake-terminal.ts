import type { Terminal, TerminalStream } from "../src/sinks/terminal";

export interface FakeTerminal {
	terminal: Terminal;
	out: string[];
	flush(): void;
	exit(): void;
	readonly registrations: number;
}

// util.format's %s only: the renderers hand over "prefix %s" plus the message, nothing more.
function format(args: readonly unknown[]): string {
	const [first, ...rest] = args;
	if (typeof first !== "string") return args.map(String).join(" ");
	let used = 0;
	const head = first.replace(/%s/g, () => String(rest[used++]));
	return [head, ...rest.slice(used).map(String)].join(" ");
}

export function fakeTerminal({ columns = 80, rows = 24, stderr = false } = {}): FakeTerminal {
	const out: string[] = [];
	const stream = (): TerminalStream => ({
		isTTY: true,
		columns,
		rows,
		write: (chunk: unknown) => {
			out.push(String(chunk));
			return true;
		},
	});
	const deferred: Array<() => void> = [];
	const exits: Array<() => void> = [];
	return {
		terminal: {
			stdout: stream(),
			stderr: stderr ? stream() : undefined,
			format: (args) => format(args),
			onExit: (listener) => {
				exits.push(listener);
			},
			defer: (callback) => {
				deferred.push(callback);
			},
		},
		out,
		flush: () => {
			for (const callback of deferred.splice(0)) callback();
		},
		exit: () => {
			for (const listener of exits) listener();
		},
		get registrations() {
			return exits.length;
		},
	};
}
