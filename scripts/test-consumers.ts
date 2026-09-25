import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Mirrors the `consumers` job matrix in .github/workflows/ci.yml.
const fixtures = [
	{ name: "node", browser: false },
	{ name: "rsbuild", browser: true },
	{ name: "rspack", browser: true },
	{ name: "webpack", browser: true },
	{ name: "vite", browser: true },
];

const root = resolve(import.meta.dirname, "..");
const only = process.argv.slice(2);
const selected = fixtures.filter(({ name }) => only.length === 0 || only.includes(name));

function run(command: string, args: string[], cwd: string): void {
	execFileSync(command, args, { cwd, stdio: "inherit" });
}

const work = mkdtempSync(join(tmpdir(), "lololog-consumers-"));
try {
	run("pnpm", ["build"], root);
	run("pnpm", ["pack", "--pack-destination", work], root);
	const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"));
	if (!tarball) throw new Error(`pnpm pack wrote no tarball in ${work}`);

	const failed: string[] = [];
	for (const { name, browser } of selected) {
		const dir = join(work, name);
		cpSync(join(root, "tests/consumers", name), dir, {
			recursive: true,
			filter: (source) => !["node_modules", "dist"].includes(basename(source)),
		});
		try {
			run("npm", ["install", "--no-audit", "--no-fund"], dir);
			run("npm", ["install", "--no-audit", "--no-fund", join(work, tarball)], dir);
			run("npm", ["run", "check"], dir);
			if (browser) {
				run("node", ["tests/consumers/run-in-browser.mjs", join(dir, "dist"), "browser"], root);
			}
			console.log(`✓ ${name}`);
		} catch {
			failed.push(name);
			console.error(`✗ ${name}`);
		}
	}
	if (failed.length > 0) {
		console.error(`failed: ${failed.join(", ")}`);
		console.error(`kept for inspection: ${work}`);
		process.exitCode = 1;
	} else {
		rmSync(work, { recursive: true, force: true });
	}
} catch (error) {
	// A failure here happens before any fixture ran (build/pack), so there is
	// nothing fixture-specific to inspect.
	rmSync(work, { recursive: true, force: true });
	throw error;
}
