# Playground — Rollup

Minimal Rollup consumer build for [`@awacloud/fw/rollup`](../../../integrations/rollup/README.md).

Builds `src/app.js` into `dist/app.js` using the `fwRollup({ preset: 'core' })`
plugin (which exposes the `virtual:@awacloud/fw/preset/core` module) plus
`@rollup/plugin-node-resolve` to resolve the emitted `@awacloud/fw/*` subpath imports.

## Run

```sh
npm i && npx rollup -c && npx serve --no-clean-urls .
```

Run from this directory (`--no-clean-urls` avoids `serve`'s default
extension-redirect behaviour). Then open the served page and check the
devtools console: it logs the `core` preset module names and the
runtime-resolved first module.
