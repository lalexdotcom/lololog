# Overhead measurements (2026-09-30)

Taken while studying pino's techniques for the `perf/structured-output` merge
(json line by concatenation, cached ISO prefix, `stdout.write` sink for
json/logfmt). Node 24.21, Linux arm64 VM (OrbStack), 16 cores. In the tables
"main" is the code before that merge and "branch" the code it brought. Numbers are best-of-N on one
machine: read the ratios, not the absolutes. Decisions drawn from them:
`mem:project/logger` and `mem:project/backlog`.

## Method, and traps met

- Plain `node` on `dist/`, never tsx. To reach `src/*.ts` modules one by one,
  plain node strips types but cannot resolve the extensionless imports: a
  `module.registerHooks` resolve hook appending `.ts` does it.
- Micro-benchmarks: best of 7 rounds of 2 M calls after warm-up, results
  consumed so nothing is optimised away.
- A tight loop stays inside one millisecond, so any time cache always hits:
  feed the renderer a time that advances 1 ms a call.
- A tight loop is the worst case for asynchronous sinks (nothing flushes until
  it ends) and hides per-write overheads. The server shape is K lines per
  event-loop turn, with the empty turn loop measured and subtracted.
- Main-thread cost: `process.threadCpuUsage()` (callbacks included). Timing
  only the emit call understated thread-stream by 2–3×.
- I/O variants: one process each, time taken until the last byte is handed
  over.
- Do not load pino in the process that measures lololog's filtered call: it
  read 4.5 ns instead of 0.5 ns.
- `/tmp` is tmpfs here: a "file" there is memory. `/var/tmp` is a real disk.
- A slow disk is simulated faithfully by giving the child a stdout opened
  with `O_DSYNC` (each write blocks until durable: p50 0.56 ms, p99 2 ms,
  max 7 ms on `/var/tmp`). A stream that delays its callback is asynchronous
  and only reproduces a lagging pipe reader. Alternative with a chosen delay:
  wrap `process.stdout.write` with `Atomics.wait`.
- `O_DSYNC` latency swings from run to run: alternate the order of the
  variants and repeat before ranking two of them.

## Where a json line went on main (ns)

| Part | Cost |
|---|---|
| Render (`toEntry` + `serialize`) | ~890 |
| of which `toISOString()` | ~310 |
| of which Entry object + `normalize` copy + `JSON.stringify` | ~410 |
| `console.log`, tight loop to `/dev/null` | ~710 |
| `Date.now()` | ~33 |
| Filtered call | 0.4–0.8 |

## pino techniques, one by one

| Technique | Result |
|---|---|
| Line built by concatenation | render 890 → 480 ns |
| ISO prefix cached to the second | 480 → 170 ns; `isoTime` 7.5 ns on a hit, 365 ns on a miss against 311 for `toISOString` |
| Scope fragment cached | −35 ns on a scoped line |
| Hand-written string escape (`_asString`) | 11 chars: 23 against 38 ns; 60 chars: 73 against 56; pino drops it on Node 25 |
| `JSON.stringify` first, safe path on throw | 2× faster on data, but an `Error` comes out as `{}` |
| Single-pass serializer in JS, same guarantees | slower than `normalize` + native: 340 against 184 ns (flat), 664 against 366 (nested) |
| Level methods swapped for a noop | no gain, the filtered call is already under 1 ns |
| `fs.writeSync(1)` | throws `EAGAIN` on a pipe once `process.stdout` exists |

## Render alone, no I/O (ns a call)

| Call | json main | json branch | logfmt main | logfmt branch |
|---|---|---|---|---|
| `info("hello world")` | 894 | 152 | 518 | 235 |
| `info("hello %s", "world")` | 951 | 200 | 591 | 265 |
| `info("hello", payload)` | 1414 | 706 | 1706 | 1302 |
| `scope.info("hello world")` | 926 | 169 | 630 | 254 |

## End to end, one json line (ns a line; CPU a line for "per turn")

| stdout | Regime | main | branch | pino (ISO time, `process.stdout`) |
|---|---|---|---|---|
| `/dev/null` | tight loop | 1988 | 730 | 1182 |
| `/dev/null` | 1 line per turn | 2661 | 1038 | 1494 |
| tmpfs file | tight loop | 2131 | 850 | 1337 |
| pipe | tight loop | 1673 | 755 | 1305 |
| pipe | 1 line per turn | 3072 | 796 | 1810 |

Bundle: 38.3 → 40.1 kB.

## Sinks alone, main-thread CPU a line (ns), line already rendered

stdout on a pipe:

| Sink | 1 line/turn | 3 lines/turn | 20 lines/turn |
|---|---|---|---|
| `console.log` | 693 | 659 | 637 |
| `stdout.write` | 368 | 339 | 270 |
| batch per `setImmediate` + `stdout.write` | 614 | 218 | 132 |
| batch per microtask + `stdout.write` | 449 | 200 | 79 |
| sonic-boom async (pino's default) | 1335 | 715 | 729 |
| thread-stream worker | 422 | 280 | 269 |

Handing a line to a worker, time inside the call only: `postMessage` of the
rendered line 400–570 ns, `postMessage` of the record 870–1300 ns,
thread-stream 110–160 ns.

Lagging pipe reader, 20 lines a turn: no sink blocks the loop during the run
(3–4 ms max delay), the backlog sits in memory. Final flush: 1.0 s for
`stdout.write`, 13.9 s for thread-stream; its `end()` blocked the main thread
2.1 s in another run.

Reader closing the pipe (`| head -1`): the process dies on `write EPIPE` with
`console.log` and with `stdout.write` alike. A per-write guard like Console's
costs 35–330 ns and does not prevent it.

## Under load: HTTP server, three lines a request plus one filtered debug

Saturation, 50 connections (requests a second):

| stdout | logger off | main | branch | + microtask batch | + worker |
|---|---|---|---|---|---|
| pipe | 53–57k | 36–40k | 44–50k | 44–51k | 44–49k |
| file | 55–58k | 32–34k | 34–40k | 42–45k | 47–48k |
| file, `O_DSYNC` | 55–56k | 170–380 | 500–600 | 490–1600 | 46–50k |

- Main-thread CPU a request on a pipe: 12 µs off, 20 main, 15–17 branch.
- `O_DSYNC`: p99 latency 160–630 ms with direct writes, 2 ms with the worker,
  which wrote all 900 000 lines of a 300 000-request run with no backlog.
- 5000 requests a second, pipe or file: no variant differs from the logger
  switched off (p50 0.3–0.6 ms).
- 150 requests a second on `O_DSYNC`: direct write p50 ~4 ms, p99 10 ms to
  4 s depending on the run (main and branch not rankable); batch p50 0.2 ms,
  p99 2–21 ms; worker p50 0.2–0.3 ms, p99 0.9–2.7 ms.
- Every write delayed 1 ms, 150 requests a second: direct write saturates
  (p50 330 ms, p99 ~10 s); batch p50 0.19 ms.
- 90 s at 5000 requests a second on a pipe: heap flat on both (11–22 MB);
  GC 1103 runs / 189 ms on main, 832 / 149 ms on the branch; main-thread CPU
  a request 37.7 → 29.4 µs.
