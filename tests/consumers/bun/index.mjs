import { L } from "lololog";

// Bun runs JavaScriptCore but exposes V8's prepareStackTrace/CallSite API: limit's call-site keys
// take a path here that no browser takes.
L.format = "json";

/** @type {unknown[]} */
let messages = [];
const { write } = process.stdout;
process.stdout.write = (line) => {
	messages.push(JSON.parse(String(line)).msg);
	return true;
};

/** @param {string} name @param {() => void} run @param {string[]} expected */
function check(name, run, expected) {
	messages = [];
	run();
	if (JSON.stringify(messages) !== JSON.stringify(expected)) {
		process.stdout.write = write;
		throw new Error(
			`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(messages)}`,
		);
	}
}

check("a call site in a loop", () => {
	for (let i = 1; i <= 5; i++) L.limit(3).info(`loop ${i}`);
}, ["loop 1", "loop 2", "loop 3"]);

check("a callback tail-called by forEach", () => {
	// biome-ignore lint/suspicious/useIterableCallbackReturn: the expression body is the tail call under test
	[1, 2, 3, 4, 5].forEach((i) => L.limit(3).info(`forEach ${i}`));
}, ["forEach 1", "forEach 2", "forEach 3"]);

check("two call sites on one line", () => {
	const both = () => [L.once().info("a"), L.once().info("b")];
	both();
	both();
}, ["a", "b"]);

check("an explicit key across levels and scopes", () => {
	L.limit("k", 2).info("k1");
	L.scope("s").limit("k", 2).warn("k2");
	L.limit("k", 2).error("k3");
}, ["k1", "k2"]);

// Not asserted, reported: a helper that tail-calls a level method loses its frame where the engine
// drops tail-calling frames, and each line calling it then counts apart.
messages = [];
const relay = (message) => L.once().warn(message);
relay("relay");
relay("relay");
const relayed = messages.length;
process.stdout.write = write;

const hook = Error.prepareStackTrace;
Error.prepareStackTrace = (_, sites) => sites;
const callSites = Array.isArray(new Error().stack);
Error.prepareStackTrace = hook;

console.log(`info: Bun ${Bun.version}, prepareStackTrace hands CallSite objects: ${callSites}`);
console.log(`info: tail-called helper shows ${relayed} of 2 lines (2: its frame is dropped)`);
console.log("ok: bun");
