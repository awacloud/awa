# Playground — Vite

Minimal Vite consumer app for [`@awacloud/fw/vite`](../../../integrations/vite/README.md).

It loads the `core` preset through a virtual module, resolves the `signal`
module from the pre-registered runtime, and renders a tiny result into `#app`.
The `sanity: 'base'` layer is injected at the entry by the plugin.

## Run

```sh
npm i && npm run dev
```

Run from this directory. `npm run dev` starts the dev server; `npm run build`
then `npm run preview` builds for production and serves the built output.

`@awacloud/fw` resolves via a local link: the `postinstall` hook runs
[`playground/_tools/link-fw.mjs`](../../_tools/link-fw.mjs), which creates a
`node_modules/@awacloud/fw` symlink/junction pointing at the package root (live
source, no copy — `workspace:*`/`file:` don't work here, see the script header).
No publish/install of the framework itself is needed; `npm run setup` re-creates
the link without reinstalling.

## What it shows

- `fw({ preset: 'core', sanity: 'base' })` in `vite.config.js`.
- `import { runtime } from 'virtual:@awacloud/fw/preset/core'` in `src/main.js`.
- `runtime.resolve('signal')` → a writable signal mounted in `#app`.
