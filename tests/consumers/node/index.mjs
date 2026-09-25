import { describeRuntime, isBrowser, isNode } from "lololog";

if (!isNode || isBrowser)
	throw new Error(`expected Node only, got isNode=${isNode} isBrowser=${isBrowser}`);

const runtime = describeRuntime();
if (!/^node:\w+$/.test(runtime) || runtime === "node:unknown") {
	throw new Error(`expected node:<platform>, got ${runtime}`);
}
console.log(`ok: ${runtime}`);
