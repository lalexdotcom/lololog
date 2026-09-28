import { LEVELS, type Level, type RootLogger } from "../../src/index";

export function demo(L: RootLogger): void {
	for (const level of Object.keys(LEVELS) as Level[]) L[level](`${level} message`);

	const db = L.scope("db");
	db.info("connected to %s in %d ms", "postgres://localhost/app", 42, { pool: 5 });
	L.warn("slow query", { sql: "select * from users", ms: 1234 });
	L.error("request failed", new Error("boom", { cause: new TypeError("inner") }));
	L.info({ plain: "object first" }, "then text");

	L.datetime = true;
	L.success("root with datetime");
	db.notice("scope with datetime");
	L.datetime = undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function spinnerDemo(L: RootLogger, external?: () => void): Promise<void> {
	const db = L.scope("db");
	const connect = db.debug.spin("Connecting");
	const download = L.info.spin("Downloading assets", { progress: 0 });
	const files = L.notice.spin("Processing files", { total: 120 });
	const custom = L.verb.spin("Custom glyph", { glyph: "◐◓◑◒", color: "mediumpurple" });
	const cache = L.warn.spin("Warming the cache");
	for (let step = 1; step <= 24; step++) {
		await sleep(250);
		download.update({ progress: (step / 24) * 0.9 });
		files.update({ done: step * 4, total: 120 });
		if (step === 6) connect.success("Connected");
		if (step === 10) L.warn("an ordinary log between spinners");
		if (step === 12) cache.fail("Cache unreachable");
		if (step === 14) external?.();
		if (step === 18) custom.close("Custom skipped", { status: "skipped" });
	}
	download.success();
	files.fail("Processing failed", { done: 97, total: 120 });
}
