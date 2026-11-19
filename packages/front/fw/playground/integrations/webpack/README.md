# Playground — Webpack

Minimal **Webpack 5** consumer build for [`@awacloud/fw`](../../../integrations/webpack/README.md)
using the official `FwWebpackPlugin` (scheme-based virtual modules, zero custom deps).

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run start
```

`webpack` writes `dist/` (the bundle and the copied page) and the in-repo static server serves it at http://127.0.0.1:4800/. With `sanity: 'base'` the plugin injects `dist/build/sanity-base-classic.min.js`, which `bun run setup:playground` builds.

## What it shows

- `new FwWebpackPlugin({ preset: 'core', sanity: 'base' })` in `webpack.config.js`.
- `import { runtime } from 'virtual:@awacloud/fw/preset/core'` resolved via the plugin's
  Webpack 5 scheme hooks, then `runtime.resolve('errors')` to pull a module.
- The `base` sanity layer is prepended to the entry automatically by the plugin.

> **ESM-config note.** `@awacloud/fw` is `"type": "module"`, but its `./webpack` export
> is plain JS that Node can `require()`, so the CommonJS `webpack.config.js` above
> works unchanged. To use an ESM config instead, rename it to `webpack.config.mjs`
> and `import { FwWebpackPlugin } from '@awacloud/fw/webpack'`.

> Webpack emits internal deprecation warnings when run under **bun**; run the build
> with **node** (`npx webpack`) if you hit them.
