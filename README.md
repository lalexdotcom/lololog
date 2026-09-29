# lololog

Universal logger: log everywhere with style and low overhead.

## Status

Early development: the API may change before 1.0.

## Usage

```ts
import { L } from "lololog"; // or: import { logger } from "lololog"

L.info("user %s connected", "bob", { id: 3 });

const db = L.scope("db");
db.level = "warn"; // this scope only
L.enabled = false; // silences the root and every scope
```

In a terminal, each line starts with a coloured level badge; in browser
devtools, with a styled badge. When stdout is not a terminal, lines are JSON
by default; set `L.format` to `"logfmt"` or `"pretty"` to change it.

Every level method can start a spinner:

```ts
const download = L.info.spin("Downloading", { total: files.length });
download.update({ done: 3, total: files.length });
download.success("Downloaded"); // or .fail(), or .close(message, { status: "skipped" })
```

In a terminal with `pretty` output (the default), spinners stay at the bottom
and animate in place every `L.spinnerInterval` milliseconds (80 by default)
while other lines scroll above them. Elsewhere — including `json`/`logfmt` on
a terminal — each spinner writes a line every `L.spinnerInterval`
milliseconds (5000 by default; `0` writes only the first and last lines), and
json/logfmt lines carry a `spinner` field with the spinner's `id`, so a
collector can rebuild its progress from its lines.

`exec` runs an async task under a spinner:

```ts
const files = await L.info.exec("Downloading", async (onProgress) => {
	const files = [];
	for (const url of urls) {
		files.push(await fetch(url));
		onProgress({ done: files.length, total: urls.length });
	}
	return files;
});
```

The spinner ends with `success()` when the task resolves and `fail()` when it
rejects; `exec` returns the task's value or rethrows its error. `onProgress` is
the spinner's `update`.

`limit` shows the first lines of a call site and drops the rest:

```ts
for (const row of rows) L.limit(10).debug("row %o", row); // first 10 rows only
L.limit("retry", 3).warn("retrying"); // every call keyed "retry" shares 3 lines
L.once().warn("option `foo` is deprecated"); // shown once, however often reached
```

Without a key, the call site is read from a short stack trace, captured each
time the level lets the call through. A key avoids the capture; a view hoisted
out of the loop (`const capped = L.limit(10)`) captures once, and all its
calls share its limit. Counters live as long as the logger; a key built from
data (`L.once(userId)`) keeps one counter per value for that lifetime. A
view's methods need their view: `const { warn } = L.once()` does not work.
In a function that only relays a log, give it a key: under Safari, a call in
tail position (`const warn = (m) => L.once().warn(m)`) loses its call site, so
each line calling `warn` would get its own counter.

## Install

```sh
npm install lololog
```

```sh
pnpm add lololog
```

## Requirements

Node.js >= 22.3.0, or any modern browser (ESM only).

## License

[MIT](LICENSE)
