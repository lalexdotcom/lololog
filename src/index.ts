import { isMainBrowser, isNode, isWebWorker } from "./env/detect";
import { getNodeBuiltin } from "./env/node-builtin";

export { isBrowser, isMainBrowser, isNode, isWebWorker } from "./env/detect";

interface NodeOs {
	platform(): string;
}

export function describeRuntime(): string {
	if (isNode) return `node:${getNodeBuiltin<NodeOs>("os")?.platform() ?? "unknown"}`;
	if (isMainBrowser) return "browser";
	if (isWebWorker) return "worker";
	return "unknown";
}
