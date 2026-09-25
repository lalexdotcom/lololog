# Logger core design — lololog

Date: 2026-09-25
Branch: `feat/logger-core`

## Goal

Ship the first logger: a `console.log`-like API whose levels map directly onto
OpenTelemetry `SeverityNumber`, usable as `import { L } from "lololog"` in the
browser and in Node, with a coloured prefix on interactive outputs and
structured lines (`json`, `logfmt`) for collectors.

Out of scope for this lot: level aliases, user-defined colours, an OTel
exporter, worker-thread transports, environment variables other than
`NO_COLOR`.

## Constraints

- Low overhead first: a call below the threshold must cost two boolean checks
  and two comparisons, nothing else.
- Every output goes through `console.log`, and only `console.log`: no
  `console.warn`/`console.error` (they add stack traces in devtools), no
  direct `stream.write`.
- `src/` references no Node global; Node built-ins come from `getNodeBuiltin`
  (`src/env/node-builtin.ts`).
- Imports are relative and extensionless.

## Decisions

| Topic | Decision |
|---|---|
| Levels | 11 canonical levels, values = OTel `SeverityNumber` |
| Level methods | One per canonical level, generated once on the prototype; no Proxy |
| Aliases | None in this lot (no `log`, no `trace`, `level` accepts canonical keys only) |
| Scope inheritance | `enabled`: root AND scope; `level`: max(root, scope); `datetime`: `scope ?? root ?? false` |
| Root-only options | `color`, `format` |
| Output | `console.log` only |
| Renderers | `browser`, `tty`, `pretty`, `json`, `logfmt`; one pure function each |
| Default `format` | `undefined` = auto: TTY → `tty`, not a TTY → `json` |
| Worker thread | Rejected for this lot (see § 6) |

## 1. Levels and colours

```ts
export const LEVELS = {
	wth: 1, debug: 5, verb: 8, info: 9, success: 10, notice: 11,
	warn: 13, error: 17, crit: 20, alert: 22, emerg: 24,
} as const;
export type Level = keyof typeof LEVELS;
```

| Level | OTel | Syslog | Text | Background |
|---|---|---|---|---|
| `wth` | TRACE | debug (7) | black | lightgray |
| `debug` | DEBUG | debug (7) | black | yellow |
| `verb` | DEBUG4 | debug (7) | white | mediumpurple |
| `info` | INFO | info (6) | white | dimgray |
| `success` | INFO2 | info (6) | white | green |
| `notice` | INFO3 | notice (5) | white | blue |
| `warn` | WARN | warning (4) | black | orange |
| `error` | ERROR | err (3) | white | red |
| `crit` | ERROR4 | crit (2) | white | red |
| `alert` | FATAL2 | alert (1) | white | red |
| `emerg` | FATAL4 | emerg (0) | white | red |

Colour names are CSS colour names, so one table serves the ANSI output and the
browser CSS. `src/style/ansi.ts` takes over the existing `STYLES` / `colorize`
and adds `lightgray`: text `[38, 5, 252]`, background `[48, 5, 252]`. The
`green` and `grey` backgrounds use the 256-colour entries of their CSS shade,
`[48, 5, 28]` (`#008700`) and `[48, 5, 244]` (`#808080`), so white text keeps
the same contrast in the terminal as in the browser. `dimgray` (background
`[48, 5, 242]`) is added for `info`: white on `grey` is 3.9:1, under the 4.5:1
below which VS Code's terminal repaints the text dark.

The level label is the level key in upper case (`WARN`, `SUCCESS`, `WTH`).

## 2. Public API

```ts
export type Format = "pretty" | "json" | "logfmt";

export interface Logger {
	enabled: boolean;
	level: Level;
	datetime: boolean | undefined;
	wth(...args: unknown[]): void;
	// … one method per level …
	emerg(...args: unknown[]): void;
}

export interface RootLogger extends Logger {
	color: boolean;
	format: Format | undefined;
	scope(name: string): Logger;
}

export const logger: RootLogger;
export const L: RootLogger; // same instance as `logger`
export { LEVELS };
export type { Level, Format, Logger, RootLogger };
```

**Defaults.** `enabled: true`, `level: "wth"`, `datetime: undefined` (reads as
off), `color: true` unless `NO_COLOR` is set to a non-empty string at load
(no-color.org), `format: undefined`.

**Scopes.** `scope(name)` exists on the root only: a scope has no `scope()`.
The same name returns the same instance, so a setting made on `L.scope("db")`
in one module applies wherever `db` is used. A scope's own options start at
`enabled: true`, `level: "wth"`, `datetime: undefined`.

**Effective values**, read live at each call so a change on the root reaches
every scope at once:

- enabled: `root.enabled && scope.enabled`
- threshold: `LEVELS[level] >= LEVELS[root.level] && LEVELS[level] >= LEVELS[scope.level]`
- datetime: `scope.datetime ?? root.datetime ?? false`

**Setters.** Assigning an unknown level to `level` or an unknown value to
`format` throws a `TypeError`: it is a programming error, caught at
configuration time. Logging calls themselves never throw (§ 4).

**Singleton.** `index.ts` stores the root in
`globalThis[Symbol.for("lololog")]`, creating it only when absent. Two copies
of the library in one process (two versions in `node_modules`, two bundles)
share one root; the first loaded wins.

## 3. Call flow

`write(level, args)`, shared by the root and the scopes:

1. **Filter.** Return at once when an effective `enabled` is false or the
   level is below either threshold. The per-level numeric value is bound into
   each generated method, so no lookup happens here.
2. **Record.** `{ level, time: Date.now(), scope, datetime, args }`: one
   instant per call, shared by the `[datetime]` prefix and the `json`/`logfmt`
   `time` field.
3. **Output.** `console.log(...renderer(record))`.

The level methods are generated once, at module load, by a loop over `LEVELS`
on the base class prototype; each one calls `this.write(<value>, args)`.

## 4. Renderers

### Selection

Evaluated in order; recomputed when the root's `color` or `format` changes.
`TTY` means `isNode && process.stdout.isTTY`, read once at load through
`getNodeBuiltin("process")`; it is `false` outside Node.

| Renderer | Condition |
|---|---|
| `browser` | `isBrowser` (wins over `isNode`: Electron renderers and jsdom are both) |
| `json` | `format === "json"`, or `format === undefined && !TTY` |
| `logfmt` | `format === "logfmt"` |
| `tty` | `TTY && color` (format `undefined` or `"pretty"`) |
| `pretty` | every other case |

`pretty`, `json` and `logfmt` need nothing from Node, so Deno, Bun and edge
runtimes land on them (`json` by default).

### Prefix rules shared by `browser`, `tty`, `pretty`

The prefix is concatenated to the first argument when it is a string, so
`console.log` keeps interpreting the caller's `%s`/`%o` natively and objects
stay inspectable. When the first argument is not a string, the prefix is
passed as a separate first argument.

`[datetime]` is a separate bracketed block after the level prefix, formatted
by one `Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle:
"medium" })` created on first use (`25/09/2026 10:00:00` in `fr`).

### `browser`

- Colour on: `"%cWARN <db>%c %c[25/09/2026 10:00:00]%c " + arg0`, with the
  badge CSS `color: <text>; background-color: <bg>; padding: 1px 4px;
  border-radius: 4px`, the date CSS `color: lightgray`, and empty strings to
  reset. Without a scope: `WARN`; without datetime: no date block.
- Colour off: `"[WARN <db>] [25/09/2026 10:00:00] " + arg0`, no `%c`.

### `tty`

`<badge> <scope> <date> ` + arg0, where:

- badge: the label centred on `max label length + 2` (9 columns, a space on
  each side of `SUCCESS`), wrapped in the level's text and background colour.
  `WARN` renders as `  WARN   ` (extra space on the right). The 11 badges are
  computed once at load.
- scope: `<db>` in `grey` text, outside the badge; absent for the root.
- date: `[…]` in `lightgray` text; absent when datetime is off.

Known limit: with `color: false`, the `pretty` renderer is used, but Node's
`console.log` still colours inspected objects, because it follows
`stdout.hasColors()`, which knows `NO_COLOR` and not our option.

### `pretty`

`"[WARN <db>] [25/09/2026 10:00:00] " + arg0`: no padding, no colour, scope
inside the brackets.

### `json` and `logfmt`

Both start from the same message extraction:

1. **Specifiers.** When the first argument is a string, `%s %d %i %f %j %o %O
   %c %%` consume the following arguments, as `util.format` does: `%s` →
   `String()` for primitives and safe JSON for objects; `%d` → `Number()`;
   `%i` → `parseInt()`; `%f` → `parseFloat()`; `%j %o %O` → safe JSON; `%c` →
   consumed and dropped; `%%` → `%`. A specifier with no argument left stays
   literal.
2. **`msg` / `data`** from what remains:

   | Call | `msg` | `data` |
   |---|---|---|
   | `info("hello")` | `"hello"` | absent |
   | `info("hello", {id:1})` | `"hello"` | `{id:1}` |
   | `info("hello", 1, 2)` | `"hello"` | `[1,2]` |
   | `info({id:1})` | `""` | `{id:1}` |
   | `info({id:1}, "x")` | `""` | `[{id:1},"x"]` |

   `msg` is the formatted first argument when it is a string, `""` otherwise.
   `data` is absent with no argument left, the value itself with one, an array
   with several.

**Safe serialisation.** Never throws: an `Error` becomes `{ name, message,
stack, cause }` (`cause` serialised recursively), a circular reference becomes
`"[Circular]"`, a `bigint` becomes its decimal string. Everything else follows
`JSON.stringify`.

**`json`**: one line, fields in this order, `scope` and `data` omitted when
absent, `time` always present in ISO 8601 UTC whatever `datetime` says:

```json
{"time":"2026-09-25T10:00:00.000Z","level":"warn","severity":13,"scope":"db","msg":"user bob","data":{"id":3}}
```

**`logfmt`**: same fields, same order; `data` is its safe JSON. A value is
quoted when it is empty or contains a space, `"`, `=` or a control character;
inside quotes, `\` and `"` are escaped and newlines become `\n`.

```
time=2026-09-25T10:00:00.000Z level=warn severity=13 scope=db msg="user bob" data="{\"id\":3}"
```

## 5. Modules

| Module | Role |
|---|---|
| `src/levels.ts` | `LEVELS`, `Level`, `LEVEL_STYLES` |
| `src/style/ansi.ts` | `STYLES` (with `lightgray`) and `colorize` |
| `src/env/tty.ts` | `isTTY` and `NO_COLOR`, through `getNodeBuiltin("process")` |
| `src/format/specifiers.ts` | `(args) → { msg, rest }` and the `msg`/`data` rule |
| `src/format/serialize.ts` | safe JSON |
| `src/renderers/{browser,tty,pretty,json,logfmt}.ts` | one pure `record → unknown[]` each |
| `src/renderers/select.ts` | pure `({ isBrowser, tty, color, format }) → renderer` |
| `src/logger.ts` | base class, root and scope loggers, `write`, method generation, scope cache |
| `src/index.ts` | singleton and public exports |

Scaffolding cleanup: `describeRuntime` and its test go; `index.ts` stops
exporting `isNode`, `isBrowser` and the other environment flags, which stay
internal. `CHANGELOG.md` records the logger under `Added` and those removals
under `Removed`.

## 6. Rejected: worker-thread output

Measured on Node 22, main-thread cost per log: `worker.postMessage(record)`
alone ≈ 1.3 µs, `JSON.stringify` + `console.log` ≈ 0.7–1.2 µs, native
`console.log` with object inspection ≈ 2–2.5 µs. Sending to a worker costs as
much as rendering `json` outright, structured clone throws `DataCloneError` on
functions, a worker's `process.stdout` forwards to the main thread (so it
would have to write to fd 1 directly and give up `console.log`), and buffered
lines are lost on crash or `process.exit()`. The renderer → write boundary
keeps the door open for an opt-in transport later, if a measured case calls
for it.

## 7. Testing

TDD with rstest; every test file runs in the `node` and `browser` projects.

- **Pure units**: the specifier parser against the `msg`/`data` table;
  `serialize` against `Error`, `cause`, circular, `bigint`; each renderer
  against fixed records (label centring, scope, datetime on/off, colour
  on/off, logfmt quoting); `select` against every row of the selection table.
- **Logger**, with a spy on `console.log`: threshold, root/scope combination
  (`enabled` AND, `level` max, `datetime ??`), a root change reaching existing
  scopes, scope cache, setter `TypeError`s, singleton reuse through
  `Symbol.for("lololog")`.
- **Consumer fixtures**: each replaces its `describeRuntime()` check with a
  `console.log` interception around `L.info("x")`: plain text under Node
  (`json`, since the fixture's stdout is not a TTY), a `%c` format in the
  browser bundles.

## Success criteria

`pnpm exec biome ci`, `pnpm typecheck`, `pnpm build`, `pnpm lint:package`,
`pnpm test` and `pnpm test:consumers` all green, and `L.info("hello")` renders
as specified in a TTY, in a pipe (`json`), and in Chromium devtools.
