interface RuntimeScope {
	process?: { getBuiltinModule?: unknown };
	window?: { document?: unknown };
	self?: unknown;
	WorkerGlobalScope?: unknown;
}

export function isNodeScope(scope: object): boolean {
	const { process } = scope as RuntimeScope;
	// The tag rules out polyfills such as process/browser, which are plain objects and
	// may fake versions.node; getBuiltinModule is the capability the library relies on.
	return (
		Object.prototype.toString.call(process) === "[object process]" &&
		typeof process?.getBuiltinModule === "function"
	);
}

export function hasDocument(scope: object): boolean {
	return (scope as RuntimeScope).window?.document !== undefined;
}

export function isWorkerScope(scope: object): boolean {
	const { self, WorkerGlobalScope } = scope as RuntimeScope;
	// Not `self` alone: Deno and edge runtimes define it without being web workers.
	return typeof WorkerGlobalScope === "function" && self instanceof WorkerGlobalScope;
}

export const isNode = /* @__PURE__ */ isNodeScope(globalThis);
export const isMainBrowser = /* @__PURE__ */ hasDocument(globalThis);
export const isWebWorker = !isNode && /* @__PURE__ */ isWorkerScope(globalThis);
export const isBrowser = isMainBrowser || isWebWorker;
