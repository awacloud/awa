# `@awacloud/fw` — Integrations

Bridges to JS ecosystem tooling. **Separate scope** from the core (`src/`) and internal tooling (`tools/`): these integrations depend on third-party APIs (bundlers, test runners, frameworks) and evolve at their own pace, independently from the framework itself.

`@awacloud/fw` remains **dependency-free and self-contained** — each integration is optional, opt-in, and pulls nothing into the application bundle beyond what the user actually consumes.

## Available

| Integration | Entry | Package export | Role |
|---|---|---|---|
| [Vite](./vite/README.md) | `integrations/vite/` | `@awacloud/fw/vite` (+ `@awacloud/fw/vite-env`) | Vite plugin: virtual modules `virtual:@awacloud/fw/preset/*` and `…/side-bundle/*`, sanity injection, ambient types. |
| [esbuild](./esbuild/README.md) | `integrations/esbuild/` | `@awacloud/fw/esbuild` | esbuild plugin (consumer): same virtual modules via `onResolve`/`onLoad`. Node build backend: see dedicated row. |
| [Rollup](./rollup/README.md) | `integrations/rollup/` | `@awacloud/fw/rollup` | Rollup plugin (consumer): `resolveId`/`load`/`transform`, like Vite without the extras. |
| [Bun](./bun/README.md) | `integrations/bun/` | `@awacloud/fw/bun` | Consumer Bun plugin (`Bun.build` + runtime `plugin()`). **Distinct** from the internal builder. |
| [Webpack](./webpack/README.md) | `integrations/webpack/` | `@awacloud/fw/webpack` | Webpack 5 plugin via native schemes (`resolveForScheme`), no dependency. |
| [esbuild — backend](./esbuild/README.md) | `integrations/esbuild/backend.js` | (internal, via `--backend esbuild`) | Node build backend (role 2, **recommended**): replaces `Bun.build`/`Bun.gzipSync` → `dist/build/*` under pure Node. |
| [Rollup — backend](./rollup/README.md) | `integrations/rollup/backend.js` | (internal, via `--backend rollup`) | Alternative Node build backend (role 2): Rollup + terser. Heavier than esbuild. |
| [Astro](./astro/README.md) | `integrations/astro/` | `@awacloud/fw/astro` | Astro integration: re-injects the Vite plugin via `astro:config:setup`; client-only sanity; SSR `render.toHTML`→`hydrate`. |
| [Next.js](./nextjs/README.md) | `integrations/nextjs/` | `@awacloud/fw/next` | `withFw(nextConfig)` wires the Webpack plugin (or the Turbopack row below, for `next dev --turbopack` / Next ≥16 default); client-only sanity; SSR data. |
| [Turbopack](./turbopack/README.md) | `integrations/turbopack/` | `@awacloud/fw/turbopack` | `fwTurbopack()`: Turbopack has no plugin API, so the adapter materializes each virtual module to a real file (`.fw-virtual/` by default) and returns a `resolveAlias` map. Consumed by the Next.js row above. The one adapter here that is **not** side-effect-free at construction (it writes to disk when called) — see [Bundler integration § Side-effecting modules](../docs/guide/integration-bundlers.md#side-effecting-modules). |
| [NestJS](./nestjs/README.md) | `integrations/nestjs/` | `@awacloud/fw/nest` | `FwModule.forFeature([…])`: worker-safe modules as Nest providers; **DOM guard** (rejects `fw.dom.*`). Backend. |
| [Vitest](./vitest/README.md) | `integrations/vitest/` | `@awacloud/fw/vitest/shim` | Node runner: shim `bun:test`→vitest (bridges `done` + `test.if`), `environment: 'node'`. Suite intact: 8344 pass / 2 engine diffs. |
| [Jest](./jest/README.md) | `integrations/jest/` | `@awacloud/fw/jest/shim` | Alternative Node runner: shim `bun:test`→`@jest/globals` (bridges `test.if`), ESM via `--experimental-vm-modules`. Vitest recommended. |
| [TypeDoc](./typedoc/README.md) | `integrations/typedoc/` | (script `docs:api`) | HTML API reference generated from `dist/types` → `docs/api-generated/` (separate, gitignored, outside tarball). |
| [ESLint](./eslint/README.md) | `integrations/eslint/` | (consumed by root `eslint.config.js`) | Custom rule `fw/no-factory-capture` (worker serialization). Other guards (`no-restricted-*` derived from sanity) live in `eslint.config.js`. |

> **Shared core**: `integrations/_shared/core.js` (internal, not exported) carries the bundler-agnostic logic — resolves `fw.config.json` through the shipped pure resolver (`_shared/config-resolve.js`), reads the committed module catalog (`_shared/catalog.generated.json`), matches virtual specifiers, emits code (`emit(rawId)`). The default config path and an `options.configPath` override go through the **same** resolver code path (no baked-in vs live divergence). Each adapter (Vite, esbuild, …) is just a thin shell that hooks its `resolve`/`load` callbacks onto this core. The generated code is therefore **identical** across bundlers. Because the catalog is a committed artifact, `integrations/**` imports only `node:` builtins + fw files — no live `src/` scan, so `@awacloud/fw` stays zero-runtime-dep at consume/pack time.

> **e2e validation**: [`integrations/_e2e/`](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/_e2e/README.md) does real builds (esbuild/rollup/webpack/bun) of the same fixture and verifies the complete chain. The bundler/test tools are **neither devDependencies nor peerDependencies** (the default install stays lean): they are installed on demand via `bun run setup:e2e` / `setup:vitest` (`bun add --no-save`), and the runners auto-skip those that are absent.

## Runtime targets (documented compat)

Node.js and Deno are not plugins but **runtime targets**: documented compat + browser-only boundary (`dom/*`, `sanity`) vs worker-safe. All other integrations above are delivered.

| Target | Doc | Status |
|---|---|---|
| Node.js | [README](./nodejs/README.md) · [runtime DX](../docs/dev/runtime.md) | ✅ build (esbuild/rollup backends), tests (Vitest/Jest), consumption — all covered; example Node-native `package.json` provided |
| Deno | [README](./deno/README.md) | documented compat + smoke-test ([`check-deno.ts`](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/deno/check-deno.ts)); **runtime + serialized Worker validation pending a Deno env** |

> **PC/Android packaging** (Tauri/Capacitor/Electron): **out of scope here**. Handled in a dedicated monorepo-level folder (type `office`), shared by `fw`, `sde-core` and `sdc-core` — multi-target packaging is not a *front* integration.

## Convention

- One subfolder per integration (`integrations/<name>/`).
- Each reads the shared **source of truth** — `fw.config.json` resolved by the shipped pure resolver (`_shared/config-resolve.js`) plus the committed module catalog (`_shared/catalog.generated.json`) — rather than duplicating preset/module knowledge. Regenerate the catalog after adding/renaming fw modules: `bun run integrations:catalog` (verify in CI with `bun run integrations:catalog:check`).
- No hard runtime dependency on the third-party tool: typed against a minimal structural shape (cf. `vite/index.d.ts` which does not depend on the `vite` package).

## See also

- [Bundler integration](../docs/guide/integration-bundlers.md) — standalone vs bundler-integrated.
- [Per-integration HMR status](../docs/guide/integrations-hmr.md) — what each integration above does (or, today, does not do) with the host bundler's Hot Module Replacement channel.
- [`docs/tools/README.md`](../docs/tools/README.md) — internal tooling (build, rendering, types).
