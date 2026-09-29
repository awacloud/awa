# `@awacloud/fw/rollup`

Official Rollup plugin — **consumer role** (role 1). The Vite plugin *is* a Rollup plugin under the hood; this adapter mirrors its `resolveId`/`load`/`transform` shape, without the Vite extras.

> **Role 2** (Rollup as a Node build backend) is delivered in [`backend.js`](./backend.js) — see the section below.

## Usage

```js
// rollup.config.js
import fwRollup from '@awacloud/fw/rollup';

export default {
    input: 'src/app.js',
    output: { dir: 'dist', format: 'es' },
    plugins: [fwRollup({ preset: 'site-interactive', sanity: 'base' })],
};
```

```js
// src/app.js
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

const cryptoBasic = await import('virtual:@awacloud/fw/side-bundle/crypto-basic');
cryptoBasic.install(runtime);
```

## Virtual modules

| Specifier | Content |
|---|---|
| `virtual:@awacloud/fw/preset` | pre-instantiated runtime for the default preset (`options.preset`) |
| `virtual:@awacloud/fw/preset/<name>` | same for preset `<name>` |
| `virtual:@awacloud/fw/side-bundle/<name>` | `export function install(runtime)` + `modules` |

Emitted code **identical** to other bundlers (shared core `../_shared/core.js`).

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the specifier without suffix |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup |
| `sanity` | `'base' \| 'community' \| 'lockdown' \| false` | `false` | prefixes the sanity layer on each entry chunk |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |

## Node build backend (role 2) — [`backend.js`](./backend.js)

**Alternative** Node backend to the bun builder (parallel to esbuild), to produce `dist/build/*` without bun. Rollup + `@rollup/plugin-terser` (minification) + `@rollup/plugin-node-resolve`. Same contract (`buildOne`/`buildClassical`), hash `node:crypto`, gzip `node:zlib`.

> **Heavier than esbuild** — esbuild remains the recommended Node backend. This one is for pipelines already Rollup-centered.

```sh
bun run setup:e2e        # installs rollup + plugins (terser, node-resolve)
bun run prebuild:rollup  # bun, rollup backend
node ../../../tools/fw-bundler/src/bundle/index.js --backend rollup   # build under pure Node
```

Validated: full build under pure Node (8 presets + 8 side-bundles + sanity, `pure`+`classic`). Sizes comparable (terser gzip slightly better, e.g. full ≈ 184 KB gz vs 198 KB esbuild). Selected via `--backend rollup` / `FW_BUILD_BACKEND=rollup` — never auto-selected (bun/esbuild only in auto mode).

## Notes (consumer plugin)

- **Sanity**: injected via the `transform` hook on `isEntry` modules. `'base'`/`'community'`: bare side-effect import. `'lockdown'`: `import { lockdown } from '…'; lockdown();` (explicit-call module, not an IIFE). Browser-only — do not enable for a Node/Worker target.
- **Resolution**: the emitted `@awacloud/fw/*` imports are resolved by Rollup via the app's resolver (typically `@rollup/plugin-node-resolve`).
