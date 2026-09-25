import { createRsbuild } from "@rsbuild/core";

const rsbuild = await createRsbuild({
	cwd: import.meta.dirname,
	rsbuildConfig: { source: { entry: { index: "./src/index.js" } } },
});
rsbuild.onAfterBuild(({ stats }) => {
	if (stats?.hasWarnings()) {
		console.error("rsbuild emitted warnings");
		process.exitCode = 1;
	}
});
await rsbuild.build();
