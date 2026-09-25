import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const [dir, expected] = process.argv.slice(2);
if (!dir || !expected) {
	console.error("usage: run-in-browser.mjs <dist-dir> <expected-result>");
	process.exit(2);
}

const root = resolve(dir);
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
	const path = new URL(req.url ?? "/", "http://localhost").pathname;
	const file = normalize(join(root, path === "/" ? "index.html" : path));
	if (!file.startsWith(root + sep)) {
		res.writeHead(403).end();
		return;
	}
	try {
		const body = await readFile(file);
		const type = contentTypes[extname(file)] ?? "application/octet-stream";
		res.writeHead(200, { "content-type": type }).end(body);
	} catch {
		res.writeHead(404).end();
	}
});
await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
const { port } = server.address();

const browser = await chromium.launch();
const errors = [];
try {
	const page = await browser.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto(`http://127.0.0.1:${port}/`);
	const result = await page
		.waitForFunction(() => window.__result, null, { timeout: 5000 })
		.then((handle) => handle.jsonValue())
		.catch(() => undefined);
	if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);
	if (result !== expected) {
		throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`);
	}
	console.log(`ok: ${result}`);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await browser.close();
	server.close();
}
