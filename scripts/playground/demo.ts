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
