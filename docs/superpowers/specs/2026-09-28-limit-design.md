# Limit design — lololog

Date: 2026-09-28
Branch: `feat/limit`

## Goal

Cap how many lines a log call shows. `L.limit(10).debug(…)` in a loop shows
the first 10 lines and stays silent after; `L.once().debug(…)` shows one. A key
shares one cap between several call sites; without a key, the call site is
the key, read from the stack.

Out of scope: resetting a counter, a per-scope key space (a possible later
addition: it only narrows sharing, so the API stays), limited spinners.

## Constraints

- A limit counts lines seen: a call filtered by `enabled` or `level` neither
  counts nor captures a stack, so it costs what a filtered log costs today.
- Capturing a stack is the expensive part and runs only when the line would
  be emitted and no explicit key was given.
- `Error.stackTraceLimit` and `Error.prepareStackTrace` are process-wide:
  changed only around a synchronous capture, restored right after.
- A logger never drops a line because of the environment: no readable stack
  means no limit, not silence.

## Decisions

| Topic | Decision |
|---|---|
| Entry points | `limit(n)`, `limit(key, n)`, `once()`, `once(key)`, on the root and on every scope |
| What counts | Lines emitted; filtered calls do not count |
| Past the cap | Silence; no summary line |
| Explicit key | One counter per root, shared by every level and every scope |
| Different `n`, same key | Each call emits while the shared counter is below its own `n` |
| Keyless view | Keyed by the call site of its first emitted line, kept for the view's life |
| `once(key?)` | Exactly `limit(1)` / `limit(key, 1)`: a view, keyed like any view |
| Key spaces | Explicit keys and call sites in two separate maps: no collision |
| View methods | Plain call only, no `spin` or `exec`; on the prototype, not per-view closures |
| `n` validation | Integer ≥ 0, otherwise `TypeError`; `0` silences everything |
| Stack capture | `Error.stackTraceLimit = 3` and `Error.prepareStackTrace` returning the CallSite array, `new Error().stack`, restore both; V8 key `file:line:column`, text frame line elsewhere |

## 1. Public API

```ts
type LimitedMethods = { [L in Level]: (...args: unknown[]) => void };

interface Logger {
	limit(n: number): LimitedMethods;
	limit(key: string, n: number): LimitedMethods;
	once(key?: string): LimitedMethods;
}
```

`LimitedMethods` is not exported from `src/index.ts`; it reaches consumers
through `Logger`.

```ts
for (const row of rows) L.limit(10).debug("row %o", row); // first 10 rows
for (const row of rows) L.once().warn("legacy row format"); // one warning

const capped = L.limit(5); // hoisted: one stack capture, at its first line
for (const row of batch) capped.info("row %o", row);

L.limit("retry", 3).warn("retrying a"); // a and b share 3 lines
L.scope("net").limit("retry", 3).error("retrying b");
```

A call through a view goes through the same filter as `L.<level>(…)` on the
logger that made the view, then through the counter, then to that logger's
`write`. The scope, datetime and renderer are those of the logger.

## 2. Counting

The root holds two `Map<string, number>`: explicit keys and call sites. Scopes
delegate to their root. For a call at `severity` with cap `n`:

1. The logger's filter rejects `severity` → return. No count, no capture.
2. Resolve the key: the explicit key; else the view's cached site; else
   capture the site (and cache it on a keyless view).
3. No site readable → emit, uncounted.
4. `count = map.get(key) ?? 0`; `count >= n` → return; else `map.set(key,
   count + 1)` and emit.

The filter in step 1 needs root and scope together, which `accepts` alone
does not give on a scope. `BaseLogger` gains an abstract `passes(severity)`
(root: `accepts`; scope: `root.accepts && accepts`), and `write` uses it.

The maps only grow. Call sites are bounded by the source; explicit keys are
bounded by what the caller passes, so a key built from data (`L.once(userId)`)
grows the map for the life of the root. Documented, not guarded.

## 3. Call site capture

`callSite()` (`src/limit.ts`) is called directly by the level method, so the
frames are always: `callSite`, the level method, the caller.

```ts
const saved = Error.stackTraceLimit;
Error.stackTraceLimit = 3;
const savedHook = Error.prepareStackTrace;
Error.prepareStackTrace = (_, sites) => sites;
const stack = new Error().stack;
Error.prepareStackTrace = savedHook; // or delete, if there was none
Error.stackTraceLimit = saved;
return siteKey(stack);
```

One capture serves both paths: an array means the engine called the
`prepareStackTrace` hook (V8), so `siteKey` reads the third `CallSite` as
`file:line:column`; anything else is the usual text stack (or none), and
`siteKey` falls back to `callerFrame`. `callerFrame(stack)` is pure: it drops
V8's leading `Error` line (the only engine whose `.stack` starts with the
message), then returns the third line, untouched. The line carries file, line
and column, so two calls on one line get two keys; parsing it would buy
nothing. SpiderMonkey ignores `stackTraceLimit`: the stack is longer, the
index still holds.

Adopted after the benchmark (Node v24.21.0, median ns per capture): text
stack 2 481, or 4 672 with source maps; CallSite objects 1 602, or 1 529 with
source maps.

## 4. Modules

- `src/limit.ts` (new): `callSite`, `callerFrame`, the view class (level
  methods installed on its prototype in a loop over `LEVEL_NAMES`). No import
  from `src/logger.ts`: it receives what it needs through a small interface
  (`passes`, `write`, `admit`).
- `src/logger.ts`: `passes` on both loggers; `limit` and `once` on
  `BaseLogger`, calling `createLimited(this, 1, key)`; `admit(kind, key, n)`
  on the root.

`L.limit(…)` and `L.once(…)` allocate one small view per call. View methods
live on the prototype: own closures would allocate eleven functions per loop
turn. The cost is that a detached view method (`const d = L.limit(10).debug`)
loses its `this`, unlike `L.debug`.

## 5. Testing

Every test file runs in both rstest projects unless marked Node only.

- `tests/limit.test.ts`:
  - `limit(n)` in a loop emits `n` lines; `limit(0)` none; `once` one;
  - two `once` calls on one line are two sites; the same line reached twice
    is one site;
  - an explicit key is shared across levels, scopes and sites; different `n`
    on one key each stop at their own cap; an explicit key never matches a
    site;
  - filtered calls (level, `enabled`, root disabled under a scope) do not
    count: raising the level afterwards still shows `n` lines;
  - a hoisted keyless view shares its cap between its sites; filtered calls
    and explicit keys capture no stack (counted through an `Error` subclass
    set on `globalThis`: V8 reads `stackTraceLimit` as a data property only,
    so an accessor there would turn stacks off);
  - `stackTraceLimit` is restored to its prior value, including a custom one;
  - `n` validation (`-1`, `1.5`, `NaN`, `"3"` → `TypeError`);
  - no readable stack (`stack` stubbed to `undefined`) → every call emits.
- `callerFrame` on fixture stacks from V8, SpiderMonkey and JavaScriptCore:
  the browser project runs Chromium only, so the other two engines are
  covered here and nowhere else.
- Benchmark (throwaway, `.scratchpad/`, Node only): a filtered `limit` call,
  an emitted one with a key, keyless inline, keyless hoisted, `once`; the
  `stackTraceLimit` path against `prepareStackTrace`, with and without
  `--enable-source-maps`. Result: § 3.
- `prepareStackTrace` restored (own property kept or left absent); `siteKey`
  turns a CallSite array into `file:line:column` and a text stack into its
  caller frame.
- Playground: `demo` gains a loop with `L.limit(3)`, `L.once` and a shared
  key.

## Success criteria

- `for (…) L.limit(10).debug(…)` shows 10 lines; `L.once().warn(…)` in a loop
  shows one.
- A filtered limited call captures no stack.
- After any call, `Error.stackTraceLimit` holds the value it had before.
- `pnpm exec biome ci`, `pnpm typecheck`, `pnpm build`, `pnpm lint:package`,
  `pnpm test`, `pnpm test:consumers` all green.
