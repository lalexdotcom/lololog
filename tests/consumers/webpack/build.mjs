import { writeFileSync } from "node:fs";
import { join } from "node:path";
import webpack from "webpack";

const dist = join(import.meta.dirname, "dist");
const compiler = webpack({
	mode: "production",
	target: "web",
	context: import.meta.dirname,
	entry: "./src/index.js",
	output: { path: dist },
});
compiler.run((error, stats) => {
	if (error) throw error;
	console.log(stats.toString({ colors: false, all: false, errors: true, warnings: true }));
	if (stats.hasErrors() || stats.hasWarnings()) {
		process.exitCode = 1;
		return;
	}
	// webpack emits no HTML page; the browser harness loads dist/index.html.
	writeFileSync(join(dist, "index.html"), '<!doctype html><script src="main.js"></script>\n');
});
