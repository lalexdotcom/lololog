import { getNodeBuiltin } from "../env/node-builtin";

export type Write = (chunk: unknown, ...rest: unknown[]) => boolean;

export interface TerminalStream {
	isTTY?: boolean;
	columns?: number;
	rows?: number;
	write: Write;
}

export interface Terminal {
	stdout: TerminalStream;
	// Only when it is a TTY: a redirected stderr never reaches the screen the zone is drawn on.
	stderr: TerminalStream | undefined;
	format(args: readonly unknown[], colors: boolean): string;
	onExit(listener: () => void): void;
	defer(callback: () => void): void;
}

interface NodeProcess {
	stdout?: TerminalStream;
	stderr?: TerminalStream;
	on(event: "exit", listener: () => void): unknown;
}

interface NodeUtil {
	formatWithOptions(options: { colors: boolean }, ...args: unknown[]): string;
}

interface NodeTimers {
	setImmediate(callback: () => void): unknown;
}

export function nodeTerminal(scope: object = globalThis): Terminal | undefined {
	const process = getNodeBuiltin<NodeProcess>("process", scope);
	const util = getNodeBuiltin<NodeUtil>("util", scope);
	const timers = getNodeBuiltin<NodeTimers>("timers", scope);
	const stdout = process?.stdout;
	if (process === undefined || util === undefined || timers === undefined) return undefined;
	if (stdout?.isTTY !== true) return undefined;
	return {
		stdout,
		stderr: process.stderr?.isTTY === true ? process.stderr : undefined,
		format: (args, colors) => util.formatWithOptions({ colors }, ...args),
		onExit: (listener) => {
			process.on("exit", listener);
		},
		defer: (callback) => {
			timers.setImmediate(callback);
		},
	};
}
