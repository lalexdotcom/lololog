# One-shot options design — lololog

Date: 2026-09-29
Branch: `feat/options`

## Goal

Override a logger setting for one call without touching the logger's state.
`L.options({ datetime: true }).info("…")` emits one timestamped line; the next
`L.info("…")` follows `L.datetime` as before.

Out of scope: overriding `enabled`, `level`, `color` or `format`. `enabled` and
`level` would let a line escape a logger switched off on purpose; `color` and
`format` would mix styles in one stream and need a renderer, or a sink, per
line. Flags added later are judged one by one: overridable or not.

## Constraints

- The override travels with the line (or the spinner), never through the
  logger's state: a spinner re-reads its datetime at every frame, and a getter
  in the arguments may log in turn, so a set-emit-restore sequence would leak
  the override or lose it.
- Keyless limits read the call site as the third frame (`callSite`, the level
  method, the caller): chaining with a limit must keep the level method called
  by the user as the one that calls `callSite`.

## Decisions

| Topic | Decision |
|---|---|
| Entry point | `options(options)`, on the root and on every scope |
| Overridable settings | `datetime` only |
| Key name | `datetime`, the name of the logger property it overrides |
| `datetime: undefined` | No override: `scope ?? root ?? false` as today |
| Validation | Strict, at the `options()` call: `TypeError` for a non-object, `null`, an array, an own key other than `datetime`, a `datetime` neither boolean nor `undefined` |
| Stored value | A copy `{ datetime }`: a caller mutating its object later changes nothing |
| Options view | Level methods with `spin` and `exec`, plus `limit` and `once` |
| Chaining | `options().limit/once()` and `limit/once().options()`, same resulting view |
| Chain with a limit | Plain call only, no `spin` or `exec` (limited spinners stay out of scope, as in the limit spec) |
| One `options()` per chain | `options().options()` and `once().options().once()` are not typed |
| Implementation | Overrides passed as a parameter down the write path; no state mutation |

## 1. Public API

```ts
export interface LogOptions {
	datetime?: boolean;
}

// Plain call only: the result of every chain that holds a limit.
type PlainMethods = { [L in Level]: (...args: unknown[]) => void };

// limit/once view: plain call, plus options().
type LimitedMethods = PlainMethods & {
	options(options: LogOptions): PlainMethods;
};

// options view: full methods (call, .spin, .exec), plus limit/once.
type OptionsMethods = LevelMethods & {
	limit(n: number): PlainMethods;
	limit(key: string, n: number): PlainMethods;
	once(key?: string): PlainMethods;
};

interface Logger {
	// … existing members
	options(options: LogOptions): OptionsMethods;
}
```

`LogOptions` is exported from `src/index.ts`, like `SpinnerOptions`, so a
consumer can type an options object built apart. `OptionsMethods`,
`LimitedMethods` and `PlainMethods` are not exported: they reach consumers
through `Logger`.

```ts
L.options({ datetime: true }).info("Timestamped message");
L.scope("db").options({ datetime: true }).warn.spin("migrating…");
L.options({ datetime: true }).once().info("…"); // PlainMethods
L.once().options({ datetime: true }).info("…"); // same view
```

The type alone closes the chain: at runtime a `LimitedView` keeps `options()`
on its prototype.

## 2. Validation

`checkOptions(options: unknown): LogOptions` (`src/overrides.ts`):

- not an object, `null`, or an array → `TypeError`;
- any key of `Object.keys(options)` other than `datetime` → `TypeError` naming
  the key (`{ date: true }`, `{ color: false }`): in plain JS a flag that is
  not overridable would otherwise be ignored silently;
- `datetime` neither a boolean nor `undefined` → `TypeError`;
- returns a new `{ datetime }`.

It runs at the `options()` call, whether or not the line is filtered later,
as `checkLimit` does at `limit()`.

## 3. Write path

The hosts gain an optional `overrides` parameter:

```ts
write(level: Level, severity: number, args: unknown[], overrides?: LogOptions): void;
spin(level, severity, message, options, overrides?: LogOptions): Spinner;
```

- root: `overrides?.datetime ?? this.datetime ?? false`;
- scope: `overrides?.datetime ?? this.datetime ?? root.datetime ?? false`;
- spinner: the `SpinnerOrigin.datetime` closure applies the same formula, so
  the override is fixed at `spin` while the fallback on scope and root stays
  live, as today.

`LimitHost.write` carries the same parameter. A later overridable flag becomes
a field of `LogOptions`; no signature changes.

## 4. Views

### `OptionsView` (`src/options.ts`)

Holds `host` and `overrides`.

- Level methods: one getter per level on the prototype. A prototype function
  cannot carry `.spin`: in `view.info.spin(…)`, `this` is `view.info`, not the
  view (the reason `BaseLogger` builds closures). The getter builds the method
  and its `.spin` / `.exec` closures for the level read only: three
  allocations per call instead of thirty-three. The method is detachable
  (`promise.catch(L.options(o).error)`).
- `limit` / `once` on the prototype: `createLimited(host, n, key, overrides)`,
  with `checkLimit` as today.

### `LimitedView` (`src/limit.ts`)

- Gains an `overrides` field (`undefined` by default), passed to
  `host.write`.
- `options(o)` on the prototype returns a new
  `LimitedView(host, n, key, checkOptions(o))`.
- Counting and `callSite()` are unchanged: the level method called is still
  the `LimitedView` prototype's, so the frames stay `callSite`, method, caller.
  A keyless view built by `options()` captures its own site at its first
  emitted line, like any keyless view.

### Behaviour on filtered calls

Unchanged: a filtered level or a disabled logger emits nothing, `spin` returns
`NOOP_SPINNER`, `exec` still runs its task. In json and logfmt the override has
no effect, as `L.datetime` has none: `time` is always there, and only the tty,
pretty and browser renderers read `datetime`.

## 5. Modules

- `src/overrides.ts` (new, no import): `LogOptions`, `checkOptions`. Apart so
  that `limit.ts` and `options.ts` both import it without importing each
  other: `OptionsView.limit` needs `createLimited`, `LimitedView.options`
  needs `checkOptions`.
- `src/options.ts` (new): `OptionsView`, `createOptions(host, overrides)`,
  the `OptionsMethods` type. Imports `limit.ts`, `overrides.ts` and
  `spinner/exec.ts`; from `src/logger.ts`, types only (`LevelMethods`). Its
  host interface extends `LimitHost` with `spin`.
- `src/limit.ts`: `overrides` on `LimitedView`, its `options()` method,
  `createLimited` gains the `overrides` argument, `PlainMethods` beside
  `LimitedMethods`.
- `src/logger.ts`: `options` on `BaseLogger` (`createOptions(this,
  checkOptions(o))`); `overrides` on `write` and `spin` of both loggers;
  `Logger` gains `options`.
- `src/index.ts`: exports the `LogOptions` type.

## 6. Cost

A filtered `L.options(o).debug(…)` pays the validation, the copy, the view and
the getter's three closures before the filter runs at the call: an estimated
few tens of ns, against ~6 ns for a filtered limited call. Measured on Node 24
(filtered call, emitted json line) and recorded in `mem:project/logger` beside
the limit figures.

## 7. Testing

`tests/options.test.ts`, in the four rstest projects:

- validation: `TypeError` for a non-object, `null`, an array,
  `{ date: true }`, `{ color: false }`, `{ datetime: "yes" }`; none for `{}`
  and `{ datetime: undefined }`;
- precedence: `true` over root `false`, `false` over root `true`, the override
  over a scope's value, fallback on `scope ?? root` without an override;
- no leak: `L.datetime` and a scope's `datetime` unchanged after the call; the
  next line without `options` follows the logger;
- spinner: the override on the frames and on the ✔ / ✖ line; changing
  `L.datetime` while it runs does not undo it; mutating the object passed to
  `options()` changes nothing; `exec` on success and on failure;
- chaining: `once` in a loop emits one timestamped line, both orders, with a
  key and without one. Helpers never call lololog in tail position
  (JavaScriptCore drops the caller's frame);
- detached method: `const warn = L.options(o).warn; warn("x")` emits;
- types, checked by `pnpm typecheck` (which includes `tests/`):
  `@ts-expect-error` on `options().options()`, `once().options().info.spin`,
  `options().once().options()`, `options({ date: true })`;
- benchmark (throwaway, scratchpad, Node only): § 6.

## 8. Documentation

- README: a short example in Usage.
- CHANGELOG: an entry under `[Unreleased]` / `Added`, in the feature commit.

## Success criteria

- `L.options({ datetime: true }).info(…)` shows a date while `L.datetime` is
  `false`, and `L.datetime` is still `false` afterwards.
- `L.options({ datetime: true }).once().info(…)` in a loop shows one dated
  line; so does `L.once().options({ datetime: true }).info(…)`.
- `L.options({ date: true })` throws a `TypeError`.
- `pnpm exec biome ci`, `pnpm typecheck`, `pnpm build`, `pnpm lint:package`,
  `pnpm test`, `pnpm test:consumers` all green.
