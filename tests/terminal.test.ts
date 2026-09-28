import { describe, expect, test } from "@rstest/core";
import { nodeTerminal } from "../src/sinks/terminal";

function withBuiltins(modules: Record<string, unknown>): object {
	return { process: { getBuiltinModule: (id: string) => modules[id] } };
}

function builtins(stdoutIsTTY: boolean, stderrIsTTY: boolean) {
	const exits: unknown[] = [];
	const immediates: unknown[] = [];
	const stdout = { isTTY: stdoutIsTTY, write: () => true };
	const stderr = { isTTY: stderrIsTTY, write: () => true };
	const modules = {
		"node:process": {
			stdout,
			stderr,
			on: (event: string, listener: unknown) => exits.push([event, listener]),
		},
		"node:util": {
			formatWithOptions: (options: { colors: boolean }, ...args: unknown[]) =>
				`${options.colors}:${args.join(",")}`,
		},
		"node:timers": { setImmediate: (callback: unknown) => immediates.push(callback) },
	};
	return { scope: withBuiltins(modules), stdout, stderr, exits, immediates };
}

describe("nodeTerminal", () => {
	test("wraps a TTY stdout with util.formatWithOptions, exit and setImmediate", () => {
		const { scope, stdout, exits, immediates } = builtins(true, false);
		const terminal = nodeTerminal(scope);
		expect(terminal?.stdout).toBe(stdout);
		expect(terminal?.stderr).toBeUndefined();
		expect(terminal?.format(["a", 1], true)).toBe("true:a,1");
		const listener = () => {};
		terminal?.onExit(listener);
		expect(exits).toEqual([["exit", listener]]);
		const callback = () => {};
		terminal?.defer(callback);
		expect(immediates).toEqual([callback]);
	});

	test("keeps stderr only when it is a TTY too", () => {
		const { scope, stderr } = builtins(true, true);
		expect(nodeTerminal(scope)?.stderr).toBe(stderr);
	});

	test("is undefined when stdout is not a TTY, or outside Node", () => {
		expect(nodeTerminal(builtins(false, true).scope)).toBeUndefined();
		expect(nodeTerminal({})).toBeUndefined();
	});
});
