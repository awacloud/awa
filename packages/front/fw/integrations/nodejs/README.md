# `@awacloud/fw` — Node.js

**Runtime target** (not a plugin): the canonical "`@awacloud/fw` under Node" page. `@awacloud/fw` targets bun **and** Node; this page consolidates what works, the single bun-specific point (resolved), and provides a drop-in Node-native `package.json`. Operational details + task table: [`../../docs/dev/runtime.md`](../../docs/dev/runtime.md).

## Quick summary

| Surface | Node? |
|---|---|
| `@awacloud/fw` as a **dependency** (ESM, subpaths, worker-safe modules, `render.toHTML` SSR data) | ✅ native |
| **Tooling** (`fw-bundler`'s `modlib/scan-modules`, `bundle/lib/config`, `fw-codegen`'s `registry`, `audit`, `rendering/aot`, `rendering/precompilation`) | ✅ `node:*` only |
| **Bundle build** (`dist/build/*`) | ✅ via **esbuild**/rollup backend (`--backend`) — replaces the single bun-specific piece (`Bun.build`/`Bun.gzipSync`) |
| **Tests** | ✅ via **Vitest** (or Jest) — shim `bun:test`, suite intact |
| **Types / lint / TypeDoc** | ✅ `tsc` / `eslint` / `typedoc` (all Node) |
| `dom/*` + `sanity` modules | ⛔ **browser-only** — do not resolve server-side (boundary shared with Deno/Nest) |

**All integrations** (`vite`, `esbuild`, `rollup`, `bun`, `webpack`, `astro`, `next`, `nest`, `vitest`, `jest`, `typedoc`) are `node:`-only code at load time → usable under Node where relevant (the **Bun** bridge targets the bun runtime, but its file remains importable under Node).

## The single bun-specific point — resolved

The builder drove `Bun.build`/`Bun.gzipSync`. It is now behind a **backend selector** (`tools/fw-bundler/src/bundle/lib/bundler.js`): `bun` (default), **`esbuild`** (recommended for Node), `rollup`. To produce `dist/build/*` under **pure Node**:

```sh
bun run setup:e2e                              # installs esbuild (on demand)
node ../../../tools/fw-bundler/src/bundle/index.js --backend esbuild
```

> **Node invocation**: target `index.js` explicitly (`node tools/<…>/index.js`, or for the mutualized tools `node ../../../tools/<fw-bundler|fw-codegen>/src/<…>/index.js`), not the directory — the `isMainModule` guard does not activate on `node <directory>`.

## Developing 100% under Node — intentional substitution

The default `package.json` is **bun**-oriented (and intentionally *lean*: heavy Node tools are installed on demand). For a Node-only setup, [`package.node.example.json`](./package.node.example.json) provides a **drop-in** profile: Node-native `scripts` (Vitest, `tsc`, `eslint`, `--backend esbuild` builds, tools via `index.js`) + Node toolchain in `devDependencies`.

```sh
# use it as inspiration, or merge its scripts/devDependencies into package.json, then:
npm install
npm test            # vitest
npm run prebuild    # node …/fw-bundler/src/bundle/index.js --backend esbuild
npm run types       # tsc
```

## See also

- [`docs/dev/runtime.md`](../../docs/dev/runtime.md) — full bun vs Node table, lean install policy.
- [esbuild backend](../esbuild/README.md) · [rollup backend](../rollup/README.md) — produce `dist/build/*` under Node.
- [Vitest](../vitest/README.md) · [Jest](../jest/README.md) — run the suite under Node.
- [Deno](../deno/README.md) — the other runtime target (same browser/server boundary).
