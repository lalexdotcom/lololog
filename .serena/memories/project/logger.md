# Logger design (shipped in the logger-core merge)

Spec: `docs/superpowers/specs/2026-09-25-logger-core-design.md` (binding);
plan: `docs/superpowers/plans/2026-09-25-logger-core.md`.

- Levels (`src/levels.ts`): 11 keys whose values are OTel SeverityNumber
  (wth 1 … emerg 24), `Object.freeze`d. No aliases (no `log`, no `trace`);
  `level` accepts canonical keys only, otherwise the setter throws TypeError.
- One method per level, created per instance in `BaseLogger`'s constructor
  as closures bound to the logger, each carrying `.spin` (spinner merge;
  was a shared prototype function, which `L.debug.spin` cannot resolve and
  which threw when detached). No Proxy (~20 ns vs ~0.3 ns per filtered call).
- Scopes: `L.scope(name)` on the root only, cached by name. Read live at each
  call: enabled = root AND scope; level = the stricter of both;
  datetime = `scope ?? root ?? false`. `color` and `format` are root-only.
- Renderers are pure `record → console args` (`src/renderers/*`), picked by
  `selectRenderer` (pure): browser (colour off → pretty) > json (format json,
  or unset and not a TTY) > logfmt > tty (TTY and colour) > pretty. TTY =
  `stdout.isTTY`, NO_COLOR read once at load.
- Output goes through a `Sink` (`src/sinks/`), picked with the renderer:
  `LiveSink` on a Node TTY when the renderer is tty or pretty
  (`util.formatWithOptions` + `stdout.write`, measured faster than
  `console.log` on a pty), `consoleSink` (`console.log` only, never
  warn/error: devtools stack traces) everywhere else. The terminal is
  injected (`Environment.terminal`, `nodeTerminal()`), so tests use
  `tests/fake-terminal.ts`.
- Spinners (spec `docs/superpowers/specs/2026-09-28-spinner-design.md`):
  `L.<level>.spin(msg, opts?)` → `update`/`close`/`success`/`fail`; filter
  fixed at spin (filtered → shared frozen no-op); one timer per root
  (`spinnerInterval`, default 80 ms live / 5000 ms console, 0 = first and
  last lines only). LiveSink pins spinners at the bottom (cap `rows - 1`,
  truncation to `columns`, 0 treated as unknown), hides the cursor (restored
  on `exit` only: no signal listener, a user choice), and wraps
  stdout/stderr `write` while its zone is drawn so external output lands
  above. json/logfmt carry `spinner: {id, status, …}`, id = per-root
  counter. Deliberately not handled: TERM=dumb, a partial write made before
  the zone exists, Ctrl+C leaving the cursor hidden.
- `L.<level>.exec(message, task, options?)` (`src/spinner/exec.ts`, pure
  `exec(spinner, task)`; logger.ts only wires it to `method.spin`): task is
  `(onProgress: Spinner["update"]) => PromiseLike<T>` (thenables accepted,
  sync callbacks rejected by design: a blocked loop never animates), returns
  `Promise<T>`, no default for `T`. Resolve → `success()`, reject or sync
  throw → `fail()` then rethrow unchanged; both without argument so the last
  message set by `onProgress` wins; the error is not appended to the ✖ line
  (the caller logs it). `success()` sits outside the try so a render throw
  is not reported as a task failure. Filtered level → `NOOP_SPINNER`, task
  still runs. `Task` is not exported from `src/index.ts`.
- Prefix: TTY badge centred on 9 columns, then a second badge ` <name> ` in
  the wth colours (black on lightgray), then `[date]` (Intl, runtime locale)
  in lightgray. Browser: `%c` badge (`padding: 1px 4px; border-radius: 4px`,
  label not padded), scope `<name>` with no background or colour, outlined
  `border: 1px solid lightgray; padding: 0 4px; border-radius: 4px` (black
  text would vanish on a dark devtools theme). Pretty: `[LEVEL] <name>
  [date]`, scope outside the brackets. Scope styles tried and rejected: TTY
  without spaces, with `[name]`; browser with the full wth badge. The prefix
  is concatenated to a string first argument so the caller's `%s` stays
  native.
- json/logfmt: own specifier parser → `msg` + `data` (absent / value /
  array); fields time (ISO, always), level, severity, scope, msg, data;
  `serialize` never throws (Error → name/message/stack/cause, cycles,
  bigint, throwing getters).
- Palette (`src/style/ansi.ts`): every name is a CSS colour name so one table
  serves ANSI and CSS; the ANSI entry must match the CSS shade, and white
  badge text needs ≥ 4.5:1 or VS Code's terminal (minimumContrastRatio)
  repaints it dark — hence warn black on orange, info white on dimgray.
- Singleton: `globalThis[Symbol.for("lololog")]`, first copy loaded wins.
- Rejected: worker-thread output (postMessage costs as much as rendering
  json, DataCloneError on functions, lost lines on exit).

Known open points (from the final review, not fixed): `%`
in a scope name is read as a specifier; Error loses own props like `code`
in json/logfmt; the Symbol key has no version; verb (white on
mediumpurple, 3.6:1) is repainted dark in VS Code's terminal.
