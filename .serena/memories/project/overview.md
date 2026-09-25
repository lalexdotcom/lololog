# lololog — overview

Universal TypeScript logger for browser and Node.js. npm description:
"Universal logger: log everywhere with style and low overhead". Two product
goals drive every design choice: low overhead and a pleasant look.

- ESM only (no CJS, no UMD); Node >= 22.3.0.
- One bundle for every environment. `src/env/detect.ts` exports module-level
  flags `isNode`, `isMainBrowser`, `isWebWorker`, `isBrowser`, computed once at
  load; they are not exclusive (jsdom and Electron renderers are both Node and
  main browser). `isNode` requires the native `[object process]` tag and
  `process.getBuiltinModule`, so a `process` polyfill never passes for Node;
  `isWebWorker` requires `self instanceof WorkerGlobalScope`, since Deno and
  edge runtimes define `self` too.
- Node built-ins are reached only through `src/env/node-builtin.ts`
  `getNodeBuiltin(name)`, on `process.getBuiltinModule` (sync, Node 22.3+). Never
  `import("node:…")`: rspack strips `webpackIgnore` from it at build time, and
  webpack 5 then warns "Critical dependency" in every consumer build.
- `src/` must not reference a Node global; `pnpm typecheck` enforces it through
  `tsconfig.build.json` (src alone, `types: []`).