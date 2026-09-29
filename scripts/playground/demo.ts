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
	for (let i = 1; i <= 5; i++) L.limit(3).debug(`limited ${i} of 5, limit 3`);
	for (let i = 1; i <= 5; i++) L.once().warn(`once ${i} of 5`);
	// A tail call: JavaScriptCore drops the arrow's frame, so the site reads as native and each
	// line shows uncounted (5 lines in Safari, 3 in V8).
	// biome-ignore lint/suspicious/useIterableCallbackReturn: the expression body is that tail call
	[1, 2, 3, 4, 5].forEach((i) => L.limit(3).info(`forEach ${i} of 5, limit 3`));
	L.limit("retry", 2).notice("retry a, key shared with the next two");
	db.limit("retry", 2).notice("retry b, from the db scope");
	L.limit("retry", 2).notice("retry c: never shown");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function spinnerDemo(L: RootLogger, external?: () => void): Promise<void> {
	const db = L.scope("db");
	const connect = db.debug.spin("Connecting");
	const download = L.info.spin("Downloading assets", { progress: 0 });
	const files = L.notice.spin("Processing files", { total: 120 });
	const custom = L.verb.spin("Custom glyph", { glyph: "◐◓◑◒", color: "mediumpurple" });
	const cache = L.warn.spin("Warming the cache");
	const sync = L.info
		.exec("Syncing", async (onProgress) => {
			for (let done = 1; done <= 10; done++) {
				await sleep(400);
				if (done === 8) onProgress("Finalizing sync", { done, total: 10 });
				else onProgress({ done, total: 10 });
			}
			return { synced: 10 };
		})
		.then((value) => L.info("Syncing resolved with", value));
	// Handled right away: Node exits on a rejection still unhandled when it settles.
	const migrate = db.error
		.exec("Migrating", async (onProgress) => {
			await sleep(1500);
			onProgress({ progress: 0.4 });
			await sleep(1500);
			throw new Error("migration 042 failed");
		})
		.catch((error: Error) => db.info("Migrating rejected with %s", error.message));
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
	await Promise.all([sync, migrate]);
}
