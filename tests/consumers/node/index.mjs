import { L, LEVELS, logger } from "lololog";

if (L !== logger) throw new Error("L and logger are different objects");
if (LEVELS.warn !== 13) throw new Error(`expected LEVELS.warn = 13, got ${LEVELS.warn}`);

/** @type {unknown[][]} */
const calls = [];
const log = console.log;
console.log = (...args) => calls.push(args);
try {
	L.scope("app").warn("hello %s", "world", { id: 1 });
} finally {
	console.log = log;
}

// CI pipes stdout (json); a developer running the fixture by hand may have a terminal.
if (process.stdout.isTTY) {
	if (!String(calls[0]?.[0]).includes("WARN")) {
		throw new Error(`expected a WARN badge, got ${JSON.stringify(calls)}`);
	}
} else {
	const entry = JSON.parse(String(calls[0]?.[0]));
	const expected = {
		level: "warn",
		severity: 13,
		scope: "app",
		msg: "hello world",
		data: { id: 1 },
	};
	for (const [key, value] of Object.entries(expected)) {
		if (JSON.stringify(entry[key]) !== JSON.stringify(value)) {
			throw new Error(
				`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(entry[key])}`,
			);
		}
	}
}
console.log("ok: node");
