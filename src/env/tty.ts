import { getNodeBuiltin } from "./node-builtin";

interface NodeProcessIo {
	stdout?: { isTTY?: boolean };
	env?: Record<string, string | undefined>;
}

export function stdoutIsTTY(scope: object): boolean {
	return getNodeBuiltin<NodeProcessIo>("process", scope)?.stdout?.isTTY === true;
}

// no-color.org: set and not empty. An empty NO_COLOR= is how a user unsets it in a shell
// where it was exported.
export function noColorRequested(scope: object): boolean {
	const value = getNodeBuiltin<NodeProcessIo>("process", scope)?.env?.NO_COLOR;
	return value !== undefined && value !== "";
}

export const isTTY = /* @__PURE__ */ stdoutIsTTY(globalThis);
export const noColor = /* @__PURE__ */ noColorRequested(globalThis);
