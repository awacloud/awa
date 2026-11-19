# Playground — Rollup

Minimal Rollup consumer build for [`@awacloud/fw/rollup`](../../../integrations/rollup/README.md).

Builds `src/app.js` into `dist/app.js` using the `fwRollup({ preset: 'core' })`
plugin (which exposes the `virtual:@awacloud/fw/preset/core` module) plus
`@rollup/plugin-node-resolve` to resolve the emitted `@awacloud/fw/*` subpath imports.

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run start
```

`rollup -c` writes the bundle and the in-repo static server serves this directory at http://127.0.0.1:4800/; the console logs the `core` preset module names.

