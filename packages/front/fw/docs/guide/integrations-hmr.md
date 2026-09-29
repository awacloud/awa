# Per-integration HMR status

**No `@awacloud/fw` integration implements, forwards or performs incremental
Hot Module Replacement today.** What a page gets when it edits application
code is the host bundler's own HMR running over fw-produced output — that is
a real and useful guarantee, but it is the *bundler's*, not fw's. The one
exception, described below, is the Vite adapter's dev-only config/catalog
watcher, and even that forces a **full** browser reload rather than patching
a module in place.

For the runtime-level (bundler-independent) HMR question — whether fw's own
`ModuleRuntime` can re-register and re-render a changed module without a
bundler in the loop — see [`hmr.md`](./hmr.md); this page covers only what
each *integration* does with the host bundler's HMR channel.

## The count

`packages/front/fw/integrations/` has **15** subdirectories once the two
infrastructure directories are excluded:

```bash
$ ls -d packages/front/fw/integrations/*/ | grep -v '/_'
astro/ bun/ deno/ esbuild/ eslint/ jest/ nestjs/ nextjs/ nodejs/ rollup/
turbopack/ typedoc/ vite/ vitest/ webpack/
```

(`_shared/` and `_e2e/` are internal infrastructure, not integrations.)
[`integrations/README.md`](../../integrations/README.md) previously listed 14
rows and omitted Turbopack — corrected there alongside this page.

## The measurement

A grep across `integrations/` (excluding `_e2e/` and `_shared/`, and read as
**real code lines only** — comments, docstrings and test-mock property names
excluded) for the token set that would mark an actual HMR hook —
`handleHotUpdate|hotUpdate|import\.meta\.hot|module\.hot|HotModuleReplacement|
invalidate|watchChange|onHotUpdate|accept\(` — returns exactly **one** hit:

```
vite/index.js:121:    server.moduleGraph.invalidateAll();
```

That line is part of the Vite adapter's dev-only `configureServer` hook (see
below) — it forces a full reload, not incremental patching, and it is the
only place in `integrations/` where any of those tokens appears as executable
code. `integrations/_e2e/run.mjs:198` sets `hmr: false` on a test harness's
Vite server to *disable* HMR for that harness; it is not an implementation of
anything.

## Per-integration table

| Integration | Entry | HMR status today |
|---|---|---|
| [Vite](../../integrations/vite/README.md) | `vite/index.js:59` `fwVitePlugin` | Host Vite HMR applies to **application** files only — the plugin defines no `handleHotUpdate`, so the `virtual:@awacloud/fw/preset/*` and `…/side-bundle/*` modules are never incrementally patched. The dev-only `configureServer` hook (`vite/index.js:94-128`) watches `fw.config.json` and the committed catalog and, on change, reloads fw's cached config, calls `server.moduleGraph.invalidateAll()`, then sends `{ type: 'full-reload' }` — see "The Vite exception" below. |
| [Rollup](../../integrations/rollup/README.md) | `rollup/index.js:53` `fwRollup` | None — Rollup has no dev-server/HMR concept; no `watchChange` hook either. |
| [esbuild](../../integrations/esbuild/README.md) | `esbuild/index.js:102` `fwEsbuild` (plugin) + `esbuild/backend.js` (Node build backend, no dev server) | None. |
| [Bun](../../integrations/bun/README.md) | `bun/index.js:77` `fwBun` | None — consumer `Bun.build`/`plugin()` adapter, no dev-server hook. |
| [Webpack](../../integrations/webpack/README.md) | `webpack/index.js:74` `apply(compiler)` | None — no `HotModuleReplacementPlugin` wiring, no invalidation call. |
| [Astro](../../integrations/astro/README.md) | `astro/index.js:58` `fwAstro` | Inherits the Vite row — `astro:config:setup` re-injects the same Vite plugin, nothing HMR-specific added on top. |
| [Next.js](../../integrations/nextjs/README.md) | `nextjs/index.js:66` `withFw` | Next's Fast Refresh covers application code; the fw virtual/aliased modules are wired through the Webpack row (or Turbopack row, below) and are not separately hot-patched. |
| [Turbopack](../../integrations/turbopack/index.js) | `turbopack/index.js:61` `fwTurbopack` | None — Turbopack has no plugin API, so the adapter **materializes** the virtual modules to real files on disk (`.fw-virtual/` by default) at construction time; a config change needs re-materialization, not a hot patch. This is also the one integrations adapter that is **not** side-effect-free at construction (see [Bundler integration § Side-effecting modules](./integration-bundlers.md#side-effecting-modules)) — the other adapters in this table only read config. |
| [NestJS](../../integrations/nestjs/README.md) | `nestjs/index.js:63` `FwModule.forFeature` | N/A — backend DI wiring, no dev-server/browser HMR concept. |
| [Vitest](../../integrations/vitest/README.md) | `vitest/vitest.config.js`, `vitest/bun-test-shim.js` | N/A — test runner; its own watch mode re-runs tests, unrelated to module HMR. |
| [Jest](../../integrations/jest/README.md) | `jest/jest.config.mjs`, `jest/bun-test-shim.js` | N/A — test runner, no watch-mode HMR concept. |
| [TypeDoc](../../integrations/typedoc/README.md) | `typedoc/typedoc.json`, `typedoc/categorize.js` | N/A — static HTML doc generation, one-shot. |
| [ESLint](../../integrations/eslint/README.md) | `eslint/no-factory-capture.js` | N/A — lint rule, no runtime/dev-server surface. |
| [Node.js](../../integrations/nodejs/README.md) | runtime target, not a plugin | N/A — documented compat target; HMR is a bundler/dev-server concern this target doesn't have. |
| [Deno](../../integrations/deno/README.md) | runtime target, not a plugin | N/A — same as Node.js. |

## The Vite exception, precisely

Task 04 of this batch closed a real gap: before it, editing `fw.config.json`
or regenerating the committed module catalog while `vite dev` was running
required killing and restarting the dev server for the change to take
effect, because the plugin's internal state was built once at construction
and never re-read. The fix adds a dev-only `configureServer` hook that
watches both files and, on a change, re-validates and swaps the cached
state, invalidates the previously-resolved virtual modules, and sends a
`full-reload` signal over Vite's HMR channel so the browser refetches the
new graph. Full details and the exact watched-file set:
[`integrations/vite/README.md`](../../integrations/vite/README.md#notes).

This is **not** incremental HMR: the plugin's own code comment states the
reason directly — the virtual modules are whole-graph structural output ("an
entirely different `import` list per preset/side-bundle"), not a value HMR
can patch in place, so the correct response to a config/catalog change is a
full reload, not a partial one. It is, however, the one place in
`integrations/` where fw code calls into Vite's HMR API
(`moduleGraph.invalidateAll()`, `server.hot.send(...)`) — worth naming
precisely rather than folding into the flat "no integration touches HMR"
statement above. `vite build` never calls `configureServer`, so none of this
affects production output.

## See also

- [`hmr.md`](./hmr.md) — the native, bundler-independent HMR question (fw's
  own `ModuleRuntime` re-register/re-resolve story).
- [Bundler integration](./integration-bundlers.md) — modes, tree-shaking,
  side-effecting modules (including Turbopack's construction-time write).
- [`integrations/README.md`](../../integrations/README.md) — the integration
  catalogue this page's table is a detail view of.
- [`integrations/vite/README.md`](../../integrations/vite/README.md) — full
  Vite plugin reference, including the config/catalog reload notes.
