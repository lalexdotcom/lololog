import { spawnSync } from "node:child_process";
import { L } from "../../src/index";
import { demo } from "./demo";

const FORMATS = ["auto", "logfmt", "pretty"] as const;
const child = process.env.PLAYGROUND_FORMAT as (typeof FORMATS)[number] | undefined;

if (child) {
	L.format = child === "auto" ? undefined : child;
	demo(L);
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
