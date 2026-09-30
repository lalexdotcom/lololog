import { getNodeBuiltin } from "../env/node-builtin";
import type { Sink } from "./sink";
import type { Write } from "./terminal";

export interface OutputStream {
	write: Write;
}

interface NodeProcess {
	stdout?: OutputStream;
}

export function nodeOutput(scope: object = globalThis): OutputStream | undefined {
	return getNodeBuiltin<NodeProcess>("process", scope)?.stdout;
}

// For the one-string lines of json and logfmt: console.log formats its arguments and guards
// every write, about 690 ns of main thread a line on a pipe against 370 for a direct write
// (Node 24). No error guard of its own: a closed pipe (EPIPE) ends the process through
// console.log as well.
export function streamSink(stream: OutputStream): Sink {
	return Object.freeze({
		live: false,
		log(args: readonly unknown[]) {
			stream.write(`${args[0]}\n`);
		},
		draw() {},
		dispose() {},
	});
}
