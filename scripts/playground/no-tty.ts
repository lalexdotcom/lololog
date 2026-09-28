import { spawnSync } from "node:child_process";
import { L } from "../../src/index";
import { demo, spinnerDemo } from "./demo";

const FORMATS = ["auto", "logfmt", "pretty"] as const;
const child = process.env.PLAYGROUND_FORMAT as (typeof FORMATS)[number] | undefined;

if (child) {
	L.format = child === "auto" ? undefined : child;
	// The 5 s default would show a single heartbeat in this 6 s scenario.
	L.spinnerInterval = 1000;
	demo(L);
	await spinnerDemo(L);
} else {
	// The lib reads isTTY once at load, so each format runs in a child whose stdout is a pipe.
	for (const format of FORMATS) {
		console.log(`\n=== format: ${format} ===`);
		const { stdout } = spawnSync(process.execPath, [...process.execArgv, import.meta.filename], {
			env: { ...process.env, PLAYGROUND_FORMAT: format },
			stdio: ["ignore", "pipe", "inherit"],
			encoding: "utf8",
		});
		process.stdout.write(stdout);
	}
}
