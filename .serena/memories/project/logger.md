# Logger design (shipped in the logger-core merge)

Spec: `docs/superpowers/specs/2026-09-25-logger-core-design.md` (binding);
plan: `docs/superpowers/plans/2026-09-25-logger-core.md`.

- Levels (`src/levels.ts`): 11 keys whose values are OTel SeverityNumber
  (wth 1 … emerg 24), `Object.freeze`d. No aliases (no `log`, no `trace`);
  `level` accepts canonical keys only, otherwise the setter throws TypeError.
- One method per level, generated once on `BaseLogger.prototype` (a Proxy
  measured ~20 ns vs ~0.3 ns per filtered call). Methods are unbound:
  `promise.catch(L.error)` throws — known, left for the user to decide.
- Scopes: `L.scope(name)` on the root only, cached by name. Read live at each
  call: enabled = root AND scope; level = the stricter of both;
  datetime = `scope ?? root ?? false`. `color` and `format` are root-only.
- Output goes through `console.log` only (no warn/error: devtools stack
  traces). Renderers are pure `record → console.log args`
  (`src/renderers/*`), picked by `selectRenderer` (pure): browser (colour off
  → pretty) > json (format json, or unset and not a TTY) > logfmt > tty (TTY
  and colour) > pretty. TTY = `stdout.isTTY`, NO_COLOR read once at load.
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

Known open points (from the final review, not fixed): unbound methods; `%`
in a scope name is read as a specifier; Error loses own props like `code`
in json/logfmt; the Symbol key has no version; verb (white on
mediumpurple, 3.6:1) is repainted dark in VS Code's terminal.
