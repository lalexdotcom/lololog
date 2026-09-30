# Backlog

Ideas examined and parked, with the evidence that would matter when one is
picked up. Not commitments.

## Worker-thread output when stdout is a regular file

Parked on 2026-09-30, after the json/logfmt overhead work (the
`perf/structured-output` merge). Would be an architectural change (first runtime
dependency, a worker file next to the single bundle): spec first.

- What: for json/logfmt on Node, hand the rendered line to a worker through a
  shared-memory ring (pino's `thread-stream`, no `postMessage`), the worker
  writing to fd 1. Only when stdout is a regular file
  (`fs.fstatSync(1).isFile()`), the one case where Node writes stdout
  synchronously on the main thread.
- Why only files: on a pipe (containers, systemd) it brings nothing, and the
  worker's synchronous writes hit `EAGAIN` there because reading
  `stdout.isTTY` makes the pipe non-blocking (measured: 14 s to flush a
  backlog a direct write flushes in 1 s; pino's sync destination at 255 µs a
  line). A TTY stays on `LiveSink`, whose redraw must be synchronous.
- Refines the rejection recorded in `mem:project/logger`: that one is about
  rendering in the worker over `postMessage` and still holds (sending the
  record costs 870–1300 ns of main thread against ~170 ns to render in place;
  sending the rendered line by `postMessage` gains nothing over a direct
  write).
- Evidence, all in `mem:project/measurements` ("Under load"): at saturation
  the worker matches direct writes on a pipe, beats them by 20–40 % on a plain
  file, and holds 46–50k requests a second on a file opened `O_DSYNC` where
  direct writes fall to 500–600 (p99 latency 2 ms against 160–630 ms). At
  5000 requests a second on a pipe or a plain file no variant differs from
  the logger switched off.
- Costs to weigh: `thread-stream` plus a writer in the worker, 20–30 MB of
  RSS, more process CPU, a synchronous flush at exit (pino's `end()` blocked
  the main thread 2.1 s behind a lagging reader), ordering against other
  stdout writers.
- Cheaper alternative measured alongside: batching the lines of one
  synchronous run and writing them from a microtask. No dependency, helps on
  a plain file, holds at low rates on a slow disk, collapses at saturation
  there; needs a flush on `exit` or `L.error(...)` followed by
  `process.exit(1)` loses the line.
- The benchmark scripts were throwaway and are gone; the shape to rebuild is a
  `node:http` server with `/__reset` and `/__stop` endpoints reporting
  `process.threadCpuUsage()` and `monitorEventLoopDelay`, loaded by autocannon
  (saturation) and an open-loop client (fixed rate). Destinations and traps:
  `mem:project/measurements` ("Method").
