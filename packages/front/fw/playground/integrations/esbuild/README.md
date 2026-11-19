# Playground — esbuild

Mini-app built with the `esbuild.build` API and the consumer plugin
[`@awacloud/fw/esbuild`](../../../integrations/esbuild/README.md) (default export `fwEsbuild`).

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run start
```

`node build.mjs` writes `dist/app.js` (an ESM bundle) and the in-repo static server serves this directory at http://127.0.0.1:4800/ — open it and watch the console.

## What it shows

- `fwEsbuild({ preset: 'core', sanity: 'base' })` in a build script.
- Virtual module `virtual:@awacloud/fw/preset/core`: pre-instantiated
  runtime, resolving a module via `runtime.resolve(...)`.
- Sanity layer (`base`) prefixed on the entry point (browser-only).
