import { L } from "lololog";

declare global {
	interface Window {
		__result?: string;
	}
}

const calls: unknown[][] = [];
const log = console.log;
console.log = (...args: unknown[]) => {
	calls.push(args);
};
try {
	L.scope("app").warn("hello %s", "world");
} finally {
	console.log = log;
}

const [format, badge] = calls[0] ?? [];
window.__result =
	format === "%cWARN <app>%c hello %s" && String(badge).includes("background-color: orange")
		? "browser"
		: `unexpected: ${JSON.stringify(calls)}`;
