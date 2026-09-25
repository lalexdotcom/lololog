import { L } from "lololog";

const calls = [];
const log = console.log;
console.log = (...args) => calls.push(args);
try {
	L.scope("app").warn("hello %s", "world");
} finally {
	console.log = log;
}

const [format, badge] = calls[0] ?? [];
window.__result =
	format === "%cWARN%c %c<app>%c hello %s" && String(badge).includes("background-color: orange")
		? "browser"
		: `unexpected: ${JSON.stringify(calls)}`;
