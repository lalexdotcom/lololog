import { describe, expect, test } from "@rstest/core";
import {
	hasDocument,
	isBrowser,
	isMainBrowser,
	isNode,
	isNodeScope,
	isWebWorker,
	isWorkerScope,
} from "../src/env/detect";

const inNode = typeof window === "undefined";

function nativeLookingProcess(extra: object = {}): object {
	return { [Symbol.toStringTag]: "process", ...extra };
}

describe("isNodeScope", () => {
	test("recognises the native process of the runtime running the tests", () => {
		expect(isNodeScope(globalThis)).toBe(inNode);
	});

	test("accepts a process tagged as native with getBuiltinModule", () => {
		const process = nativeLookingProcess({ getBuiltinModule: () => undefined });
		expect(isNodeScope({ process })).toBe(true);
	});

	test("rejects the process/browser polyfill", () => {
		expect(isNodeScope({ process: { env: {}, versions: {}, browser: true } })).toBe(false);
	});

	test("rejects a plain object faking versions.node and getBuiltinModule", () => {
		const process = { versions: { node: "24.0.0" }, getBuiltinModule: () => undefined };
		expect(isNodeScope({ process })).toBe(false);
	});

	test("rejects a native process without getBuiltinModule (Node < 22.3)", () => {
		expect(isNodeScope({ process: nativeLookingProcess() })).toBe(false);
	});

	test("rejects a scope without process", () => {
		expect(isNodeScope({})).toBe(false);
	});
});

describe("hasDocument", () => {
	test("accepts a window with a document", () => {
		expect(hasDocument({ window: { document: {} } })).toBe(true);
	});

	test("rejects a window without a document", () => {
		expect(hasDocument({ window: {} })).toBe(false);
	});

	test("rejects a scope without window", () => {
		expect(hasDocument({})).toBe(false);
	});

	test("coexists with a native process (jsdom, Electron renderer)", () => {
		const process = nativeLookingProcess({ getBuiltinModule: () => undefined });
		const scope = { process, window: { document: {} } };
		expect([isNodeScope(scope), hasDocument(scope)]).toEqual([true, true]);
	});
});

describe("isWorkerScope", () => {
	class WorkerGlobalScope {}

	test("accepts a self inheriting from WorkerGlobalScope", () => {
		expect(isWorkerScope({ self: new WorkerGlobalScope(), WorkerGlobalScope })).toBe(true);
	});

	test("rejects self alone (Deno, edge runtimes)", () => {
		expect(isWorkerScope({ self: {} })).toBe(false);
	});

	test("rejects a self that is not a WorkerGlobalScope", () => {
		expect(isWorkerScope({ self: {}, WorkerGlobalScope })).toBe(false);
	});
});

describe("flags", () => {
	test("describe the runtime running the tests", () => {
		expect({ isNode, isMainBrowser, isWebWorker, isBrowser }).toEqual({
			isNode: inNode,
			isMainBrowser: !inNode,
			isWebWorker: false,
			isBrowser: !inNode,
		});
	});
});
