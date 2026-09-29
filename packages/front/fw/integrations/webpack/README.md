# `@awacloud/fw/webpack`

Official Webpack 5 plugin — **consumer role**. Exposes `@awacloud/fw` virtual modules with no external dependency.

## Approach: Webpack 5 native schemes

Webpack has no `resolveId`/`load` à la Rollup, but **Webpack 5 handles custom URI schemes** — the exact mechanism of the internal `DataUriPlugin` (`data:`). The plugin taps:

- `normalModuleFactory.hooks.resolveForScheme.for('virtual')` — intercepts `virtual:@awacloud/fw/*` specifiers and marks them as JavaScript;
- `NormalModule.getCompilationHooks(...).readResourceForScheme.for('virtual')` — returns the generated code.

→ **No dependency** (`webpack-virtual-modules` not required), no custom loader. Emitted code identical to other bundlers (shared core `../_shared/core.js`).

## Usage

```js
// webpack.config.js
const { FwWebpackPlugin } = require('@awacloud/fw/webpack');

module.exports = {
    entry: './src/app.js',
    plugins: [new FwWebpackPlugin({ preset: 'site-interactive', sanity: 'base' })],
};
```

```js
// src/app.js
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

const cryptoBasic = await import('virtual:@awacloud/fw/side-bundle/crypto-basic');
cryptoBasic.install(runtime);
```

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `preset` | `string` | `'site'` | preset of the specifier without suffix |
| `sideBundles` | `string[]` | `[]` | side-bundles validated at startup |
| `sanity` | `'base' \| 'community' \| 'lockdown' \| false` | `false` | prefixes the sanity layer on each entry |
| `packageName` | `string` | `'@awacloud/fw'` | specifier used in emitted imports |
| `configPath` | `string` | bundled | override for `fw.config.json` |

## Notes

- **Webpack 5 only** — uses `compiler.webpack.NormalModule` + scheme hooks (absent in Webpack 4).
- **Sanity**: injected by prepending the `@awacloud/fw/sanity/<base|community>` module to each entry's import list, or the `@awacloud/fw/sanity/lockdown.apply` self-applying wrapper for `'lockdown'` (the bare `.../sanity/lockdown` specifier is an explicit-call ESM and applies nothing on import). Runs before app code. Browser-only. Entries of **function** type (`entry: () => …`) are not modified: import the sanity layer manually in that case.
- **Resolution**: the emitted `@awacloud/fw/*` imports are resolved by Webpack via the app's `node_modules`.
- **Next.js** relies on this plugin (`withFw`) — see [`../nextjs/`](../nextjs/README.md).

## Validation

Structurally validated (construction, shared-core wiring, emission). A real Webpack 5 build remains to be smoke-tested on the consumer side (Webpack not installed in the `@awacloud/fw` repo).
