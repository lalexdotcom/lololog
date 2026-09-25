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
