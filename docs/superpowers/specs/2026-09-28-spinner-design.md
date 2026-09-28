# Spinner design — lololog

Date: 2026-09-28
Branch: `feat/spinner`

## Goal

Give every level method a `spin` sub-method that starts a spinner: a line
that tracks a running task, optionally with a progress, and ends with a
success, a failure or a neutral close. On an interactive terminal the
spinners stay pinned at the bottom and animate in place; everywhere else
they emit a line per tick.

Out of scope: a spinner going back from bounded to unbounded, spinner ids in
structured output, catching output from child processes spawned with
`stdio: "inherit"`, terminals using absolute positioning or the alternate
screen.

## Constraints

- A filtered `spin` costs what a filtered log costs, and returns a shared
  no-op: no timer, no allocation.
- On a Node TTY the output leaves `console.log` for `stdout.write`, since the
  spinner zone must be erased and redrawn. Everywhere else, `console.log`
  stays the only output, as in the logger-core spec.
- `src/` references no Node global; `util` and `process` come from
  `getNodeBuiltin` (`src/env/node-builtin.ts`).
- A logger never throws because of the environment it runs in: an option
  that the current output cannot honour is degraded, not refused.

## Decisions

| Topic | Decision |
|---|---|
| Entry point | `L.<level>.spin(message, options?)`, on the root and on every scope |
| Level methods | Created per instance in the constructor (closures bound to the logger), each carrying `spin` |
| Filtering | Evaluated once, at `spin`; filtered → shared frozen no-op spinner |
| Final lines | `success`, `fail`, `close` emit at the `spin` level, immediately |
| `update` | Changes state only; shown at the next tick |
| `spinnerInterval` | Root-only; `undefined` = default: 80 ms with the `LiveSink`, 5000 ms with the `ConsoleSink`; `0` = no timer, initial and final lines only |
| Non-TTY tick | Emits the current state of every active spinner, changed or not (heartbeat) |
| TTY sink | `LiveSink` (`formatWithOptions` + `stdout.write`), always on a Node TTY, spinner or not |
| External writes | `stdout`/`stderr` `write` patched while the zone is on screen |
| Cursor | Hidden while the zone is on screen, restored on `process` `exit` |
| Unbounded glyph | Braille frames in the `LiveSink`, `↻` elsewhere; overridable |
| Colours | Running turquoise, success green, fail red, close default text colour |
| json/logfmt | One `spinner` field: `{state, progress?}` or `{state, done, total}` |

## 1. Public API

```ts
type SpinnerStyle = { glyph?: string; color?: Color };
type SpinnerProgress =
	| { progress: number; done?: never; total?: never }
	| { done: number; total: number; progress?: never };
type NoProgress = { progress?: never; done?: never; total?: never };

export type SpinnerOptions = SpinnerStyle & (SpinnerProgress | NoProgress);
export type InitialSpinnerOptions =
	| SpinnerOptions
	| (SpinnerStyle & { total: number; progress?: never });

export interface Spinner {
	update(message: string, options?: SpinnerOptions): void;
	update(options: SpinnerOptions): void;
	close(message?: string, options?: SpinnerOptions): void;
	success(message?: string, options?: SpinnerOptions): void;
	fail(message?: string, options?: SpinnerOptions): void;
}

type LevelMethod = ((...args: unknown[]) => void) & {
	spin(message: string, options?: InitialSpinnerOptions): Spinner;
};

interface RootLogger {
	spinnerInterval: number | undefined;
}
```

`Spinner`, `SpinnerOptions`, `InitialSpinnerOptions` and `Color` are exported
from `src/index.ts`.

The `never` guards reject `{ progress: 0.5, total: 10 }`: excess-property
checking on a non-discriminated union accepts any key known to one member. At
runtime (plain JS), `total` present means count mode.

### Level methods

The prototype loop that generates level methods goes. `BaseLogger`'s
constructor builds the 11 methods as closures over `this`, each with its
`spin`. A filtered call still costs a closure call plus `write`'s checks.
Side effect: `promise.catch(L.error)` now works (open point of the
logger-core review).

### Lifecycle

- `spin`: checks root then scope as `write` does. Filtered → the shared no-op.
  Otherwise registers the spinner and emits its initial line.
- `message` is plain text: a `%` is never read as a specifier.
- Progress: `progress` is clamped to [0, 1], `done` to [0, total]. An options
  object without progress keys keeps the current progress. Unbounded until a
  progress is given; once bounded, stays bounded.
- `glyph`: split into grapheme clusters (`Intl.Segmenter`), so a composed
  emoji stays one frame. Giving `glyph`, even the current string, resets the
  frame index to 0; each tick increments it modulo the frame count. Outside
  the `LiveSink`, only the first frame is used.
- `color`: a palette name (§ 3), applied to the glyph, its parentheses and the
  filled part of the bar. Kept across updates until changed.
- `update`: stores message and options; nothing is written before the next
  tick.
- `close` / `success` / `fail`: emit the final line immediately and
  unregister the spinner. Final lines always show the first frame of their
  glyph. Defaults:

  | Method | Glyph | Colour | Progress shown | json `state` |
  |---|---|---|---|---|
  | `close` | `●` | default text colour | last known | `"closed"` |
  | `success` | `✔` | green | full, unless given | `"success"` |
  | `fail` | `✖` | red | last known, unless given | `"fail"` |

  The message defaults to the last one.
- Any call after the end is silently ignored.

### `spinnerInterval`

The default follows the sink, not the TTY: a TTY with `format: "json"` uses
the `ConsoleSink`, where 80 ms would print a heartbeat line 12 times a
second. The setter accepts `undefined` or a finite number ≥ 0, and throws a
`TypeError` otherwise, like the `level` and `format` setters. It restarts the
timer, since `setInterval` cannot change its period. With `0`, no timer runs
and no live zone is drawn, TTY included: the initial and final lines are
written as ordinary log lines.

## 2. Progress display

```ts
function filled(ratio: number, width: number): number {
	if (ratio <= 0) return 0;
	if (ratio >= 1) return width;
	return 1 + Math.floor(ratio * (width - 1));
}
```

Strictly between 0 and 1, the bar has at least one filled and one empty cell,
spread evenly over the intermediate cells (11.1 % per cell on 10, 14.3 % on
8). A plain floor was rejected: its first cell covers two steps.

The percent label is `floor(ratio × 100)`, raised to 1 when the ratio is not
0: it never reads `0%` beside a filled cell, nor `100%` before the end. The
count label is exact (`done/total`).

## 3. Rendering

A spinner line is the usual prefix (badge, `<scope>`, `[date]`), an
indicator, a space and the message. The palette (`src/style/ansi.ts`) gains
`turquoise`, CSS name, ANSI `[38, 5, 80]` (#5fd7d7, nearest to CSS #40e0d0);
green and red reuse the existing entries.

### `tty` (TTY and colour)

| State | Unbounded | Bounded |
|---|---|---|
| running | `(⠋)` | `━━━━──────  42%` (10 cells) |
| success | `(✔)` | `✔ ━━━━━━━━ 100%` (glyph, space, 8 cells) |
| fail | `(✖)` | `✖ ━━━─────  42%` |
| close | `(●)` | `● ━━━─────  42%` |

- Running frames: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`.
- The whole indicator takes the state colour: parentheses, glyph, filled
  cells `━`. Empty cells `─` are lightgray.
- A running bounded spinner shows no glyph. The final glyph plus its space
  takes the two cells the bar gives up, so running and final lines align.
- Labels are padded: percent on 4 characters (`  7%`, `100%`), `done`
  right-aligned to the width of `total` (`  7/120`).

### `pretty` (no colour, or not a TTY)

No bar, no padding, no ANSI.

| State | Unbounded | Bounded (%) | Bounded (count) |
|---|---|---|---|
| running | `(⠋)` on a TTY, `(↻)` elsewhere | `(42%)` | `(7/120)` |
| success | `(✔)` | `✔ (100%)` | `✔ (120/120)` |
| fail | `(✖)` | `✖ (42%)` | `✖ (7/120)` |
| close | `(●)` | `● (42%)` | `● (7/120)` |

### `browser` (colour on; colour off falls back to `pretty`)

The console cannot erase a line: each tick is a new `console.log`, so the
unbounded running glyph is `(↻)`. The indicator goes through `%c` segments
after the existing prefix ones:

- glyph segments: `font-family: monospace; color: <state colour>`;
- bar: one space styled
  `font-family: monospace; background: linear-gradient(to right, ${c} 0%, ${c} ${pct}%, lightgrey ${pct}%, lightgrey 100%); padding: 0px 48px; line-height: 0.5; border-radius: 2px`,
  where `c` is the state colour (`currentColor` for `close`'s default text
  colour) and `pct` the percent label's value;
- label: its own segment, `font-family: monospace`, no background, padded as
  in `tty`.

`font-family` sits on every segment because `%c` styles only the text up to
the next `%c`. Final bounded lines keep the full bar width with the glyph in
front: every tick is its own line, there is no zone to align.

### `json` and `logfmt`

Every spinner line (initial, tick, final) carries a `spinner` field right
after `scope`: `time`, `level`, `severity`, `scope`, `spinner`, `msg`,
`data`. Its value is `{state}`, `{state, progress}` or
`{state, done, total}`, `state` one of `"running"`, `"success"`, `"fail"`,
`"closed"`; `progress` is the clamped ratio, unrounded. `msg` is the current
message; `data` is absent.

```json
{"time":"2026-09-28T12:00:05.000Z","level":"debug","severity":5,"scope":"db","spinner":{"state":"running","done":7,"total":120},"msg":"Migrating"}
```

logfmt writes the same object as JSON in a single quoted field:

```
time=2026-09-28T12:00:05.000Z level=debug severity=5 scope=db spinner="{\"state\":\"running\",\"done\":7,\"total\":120}" msg=Migrating
```

## 4. Sinks and the live zone

`RootLoggerImpl.#select` picks a renderer and a sink together:

- `LiveSink` when running on Node, stdout is a TTY and the renderer is `tty`
  or `pretty`;
- `ConsoleSink` (`console.log(...args)`) otherwise.

`LiveSink` is on for every line on a TTY, spinner or not: measured on a pty,
`formatWithOptions` + `stdout.write` costs 1.3–4.2 µs against 4.8–9.6 µs for
`console.log` on a string, and is no slower on an inspected object.
`console.log` does the same formatting plus `console.group` indentation and
an `error` listener added and removed per call.

### Zone

- Active spinners occupy the last lines, in creation order.
- A tick redraws the zone only.
- An ordinary log erases the zone, writes its line and redraws the zone, in
  one `write`.
- A final line leaves the zone and is written above it as an ordinary log.
- Height is capped at `rows - 1`; beyond it, the last line reads `… +N`.
  Moving the cursor up cannot reach lines already in the scrollback: a
  taller zone redraws lower on every frame and piles copies into the
  scrollback (seen in the probe with an 18-line zone in a 14-line panel).
- Each line is truncated to `columns` in visible width (ANSI excluded): a
  wrapped line would break the count of lines to erase.
- `rows` and `columns` are re-read on `resize`.

### External writes

While the zone is on screen, `stdout.write` (and `stderr.write` when stderr
is a TTY) is wrapped:

- The first external write of a tick erases the zone; the zone is redrawn
  once, on `setImmediate`. Live-region libraries emit a frame over several
  writes, and redrawing between them would break their cursor arithmetic.
  With the zone erased first, their relative moves land where they expect.
- While the last external write does not end with `\n`, the zone is not
  redrawn: it would land on that partial line. A lololog line written in
  that state starts with `\n`. A library that keeps its cursor mid-line (ora)
  therefore hides our zone while it runs.
- The wrapper keeps `write`'s overloads and returns its backpressure boolean;
  lololog itself writes through the saved original.
- On removal, the original is put back only if `stream.write` is still our
  wrapper; otherwise the wrapper stays, as a pass-through.

Without the wrapper, a direct `console.log` during a spinner would be erased
by the next redraw, and a stale spinner line would stay above.

### Cursor and exit

The cursor is hidden when the zone first appears and shown when it empties.
On `process` `exit`, the cursor moves below the zone and is shown; the zone
stays on screen as its last state. No signal listener: one on `SIGINT`
suppresses the default exit, so a process killed by a signal leaves the
cursor hidden (`tput cnorm` restores it).

### Timer

One timer per root, started with the first spinner, stopped with the last,
`unref`'d where the runtime supports it. Each tick advances the frame index
of every unbounded spinner, then redraws the zone (`LiveSink`) or emits one
line per active spinner (`ConsoleSink`).

### Sink change

Setting `color` or `format` while spinners run re-selects renderer and sink.
A `LiveSink` being left erases its zone and removes its wrapper; the spinners
carry on in the new sink.

## 5. Modules

| Module | Role |
|---|---|
| `src/spinner/progress.ts` | Pure: option normalisation, `filled`, labels |
| `src/spinner/glyph.ts` | Pure: grapheme split, default frames per sink |
| `src/spinner/spinner.ts` | `Spinner` implementation and the shared no-op |
| `src/sinks/console.ts` | `ConsoleSink` |
| `src/sinks/live.ts` | `LiveSink`: zone, wrapper, cursor, resize, exit |
| `src/renderers/record.ts` | `LogRecord` gains `spinner?: {state, progress, glyph, color}` |
| `src/renderers/*` | Each renderer places the indicator between prefix and message |
| `src/logger.ts` | Per-instance level methods, `spin`, registry, timer, `spinnerInterval`, sink selection |
| `src/style/ansi.ts` | `turquoise` |

Console-based renderers escape `%` to `%%` in a spinner message.

## 6. Testing

Every test file runs in both rstest projects unless marked Node only.

- `tests/spinner-progress.test.ts`: option normalisation and clamping,
  `total` winning over `progress`; `filled` on 8 and 10 at 0, a tiny ratio,
  0.11, 0.999, 1; labels padded and unpadded, the 1 % floor and 99 % ceiling.
- `tests/spinner-glyph.test.ts`: grapheme split (braille, composed emoji),
  index reset, first frame outside the `LiveSink`.
- Renderers: a `spinner` record in every state and kind (unbounded, percent,
  count) — ANSI and widths 10/8 in `tty`; no bar, no padding in `pretty`;
  `%c` segments and their CSS in `browser`; field and position in `json`;
  quoted JSON in `logfmt`; a `%` in the message stays literal.
- `tests/spinner.test.ts` (fake timers): filtered `spin` returns the no-op;
  calls after the end are ignored; final lines are immediate; `update` shows
  at the next tick; heartbeat outside a TTY; `spinnerInterval` validation,
  `0`, restart; per-instance methods (`promise.catch(L.error)`, scope carried
  by `L.scope("x").debug.spin`).
- `tests/live-sink.test.ts` (Node only, fake stream and process): one write
  for a log during a spinner; `rows - 1` cap and `… +N`; truncation in visible
  width; `resize`; wrapper install and removal, `setImmediate` redraw,
  partial external line, wrapper left in place when patched over, stderr
  only if a TTY; cursor hidden and restored on `exit`; sink change.
- Playgrounds (`tty`, `no-tty`, `json`, `logfmt`, `web`): a shared scenario
  with an unbounded, a percent and a count spinner, a `success`, a `fail`, a
  `close`, a custom glyph and colour, ordinary logs in between; `tty` adds a
  direct `console.log` and a partial `process.stdout.write`.
- No new consumer fixture: no new `exports` entry, and the existing fixtures
  already prove `getNodeBuiltin("util")` raises no bundler warning.

## Success criteria

- `L.debug.spin("x")` animates at the bottom of a TTY while other logs scroll
  above it, and ends as an ordinary line.
- A direct `console.log` during a spinner is neither erased nor duplicated.
- The same code emits heartbeat lines in CI, `spinner` fields in json/logfmt
  and styled lines in the browser, and never throws because of the output.
- A filtered `spin` allocates nothing and starts no timer.
- `pnpm exec biome ci`, `pnpm typecheck`, `pnpm build`, `pnpm lint:package`,
  `pnpm test`, `pnpm test:consumers` all green.
