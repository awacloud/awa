# Playground — Vite

Minimal Vite consumer app for [`@awacloud/fw/vite`](../../../integrations/vite/README.md).

It loads the `core` preset through a virtual module, resolves the `signal`
module from the pre-registered runtime, and renders a tiny result into `#app`.
The `sanity: 'base'` layer is injected at the entry by the plugin.

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run dev
```

`bun run dev` starts the Vite dev server; `bun run build` then `bun run preview` serves the production build.

## What it shows

- `fw({ preset: 'core', sanity: 'base' })` in `vite.config.js`.
- `import { runtime } from 'virtual:@awacloud/fw/preset/core'` in `src/main.js`.
- `runtime.resolve('signal')` → a writable signal mounted in `#app`.
