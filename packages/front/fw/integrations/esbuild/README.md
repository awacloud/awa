# `@awacloud/fw/esbuild`

Official esbuild plugin — **consumer role** (role 1). Exposes the same virtual modules as the Vite plugin, via esbuild's native `onResolve`/`onLoad`.

> **Role 2** (esbuild as a *Node build backend* replacing `Bun.build`) is delivered in [`backend.js`](./backend.js) — see the section below.

## Installation

`esbuild` is a **peer dependency** (provided by the app). The plugin does not depend on it at the type level (minimal structural shape).

## Usage

```js
import * as esbuild from 'esbuild';
import fwEsbuild from '@awacloud/fw/esbuild';

await esbuild.build({
    entryPoints: ['src/app.js'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/app.js',
    plugins: [fwEsbuild({ preset: 'site-interactive', sanity: 'base' })],
});
```

```js
// src/app.js
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

// code-split side-bundle loaded on demand
const cryptoBasic = await import('virtual:@awacloud/fw/side-bundle/crypto-basic');
cryptoBasic.install(runtime);
```

## Virtual modules

| Specifier | Content |
|---|---|
| `virtual:@awacloud/fw/preset` | pre-instantiated runtime for the default preset (`options.preset`) |
| `virtual:@awacloud/fw/preset/<name>` | same for preset `<name>` |
| `virtual:@awacloud/fw/side-bundle/<name>` | `export function install(runtime)` + `modules` |

The emitted code is **identical** to that of the other bundlers (shared core `../_shared/core.js`): direct subpath imports + `registerAllDeep`. esbuild follows these imports and tree-shakes what the app does not use.

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the `virtual:@awacloud/fw/preset` specifier (without suffix) |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup (immediate failure if unknown) |
| `sanity` | `'base' \| 'community' \| 'lockdown' \| false` | `false` | prefixes the sanity layer on each **entry point** |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |
| `resolveDir` | `string` | build cwd | resolution directory for the emitted `@awacloud/fw/*` imports |

## Node build backend (role 2) — [`backend.js`](./backend.js)

**Node** replacement for the bun-specific builder (`tools/fw-bundler/src/bundle/lib/bundler.js` → `Bun.build` + `Bun.gzipSync`), to produce the standalone bundles `dist/build/*` **without bun**. Same contract (`buildOne`/`buildClassical` → `{ outputs, outFile, bytes, hashSha256, gzBytes }`), hash via `node:crypto`, gzip via `node:zlib`. `sanity.min.js` is emitted in `format: 'iife'`.

The selector (`tools/fw-bundler/src/bundle/lib/bundler.js`) picks the backend: **bun by default**, esbuild if forced (`--backend esbuild` / `FW_BUILD_BACKEND=esbuild`) or when bun is absent (auto). The esbuild backend is lazily imported (a bun build never needs esbuild).

```sh
bun run setup:e2e        # installs esbuild (+ bundlers) on demand
bun run prebuild:node    # node ../../../tools/fw-bundler/src/bundle/index.js --backend esbuild  → dist/build/* under pure Node
bun run prebuild:esbuild # bun, but esbuild backend (test)
```

Validated: full build under pure Node (8 presets + 8 side-bundles + sanity, `pure` and `classic` variants). Sizes comparable to the bun backend (core.min ≈ 25.6 KB vs 26.2 KB).

> **Node invocation**: target `index.js` explicitly (`node ../../../tools/fw-bundler/src/bundle/index.js`), not the directory — `node <dir>` does not set `argv[1]` to the resolved file, so the `isMainModule` guard would not execute `main()`.

## Notes (consumer plugin)

- **Sanity & entry points**: esbuild has no "transform on entry" hook like Vite. The plugin re-emits each declared entry (`entryPoints`) with the `@awacloud/fw/sanity/<base|community>` import prefixed, or with `import { lockdown } from '@awacloud/fw/sanity/lockdown'; lockdown();` for `'lockdown'` (explicit-call module, not an IIFE). The sanity layer is **browser-only** — do not enable it for a pure Node/Worker target.
- **`resolveDir`**: the emitted `@awacloud/fw/*` imports are resolved from the build cwd (the app's `node_modules`). For non-standard layouts, override via `resolveDir`.
