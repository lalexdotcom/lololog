interface NodeProcess {
	getBuiltinModule?: (id: string) => unknown;
}

// Not a dynamic import(): rspack strips `webpackIgnore` from it at build time, after
// which webpack 5 warns "Critical dependency: the request of a dependency is an
// expression" in every consumer build. getBuiltinModule leaves bundlers nothing to
// resolve.
export function getNodeBuiltin<T>(name: string, scope: object = globalThis): T | undefined {
	const { process } = scope as { process?: NodeProcess };
	return process?.getBuiltinModule?.(`node:${name}`) as T | undefined;
}
