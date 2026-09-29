# Playground — Webpack

Minimal **Webpack 5** consumer build for [`@awacloud/fw`](../../../integrations/webpack/README.md)
using the official `FwWebpackPlugin` (scheme-based virtual modules, zero custom deps).

## Run

```sh
npm i && npx webpack && npx serve --no-clean-urls dist
```

Run from this directory. `--no-clean-urls` avoids `serve`'s default
extension-redirect behaviour. Then open the served URL — the page (and the
console) prints the preset's module list and the resolved `errors` module
type. The build writes `dist/bundle.js` and copies `index.html` into
`dist/` so `serve --no-clean-urls dist` is self-contained.

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
