# Playground — esbuild

Mini-app built with the `esbuild.build` API and the consumer plugin
[`@awacloud/fw/esbuild`](../../../integrations/esbuild/README.md) (default export `fwEsbuild`).

## Run

```sh
npm i && node build.mjs && npx serve --no-clean-urls .
```

Run from this directory. `node build.mjs` produces `dist/app.js` (ESM
bundle); `npx serve --no-clean-urls .` serves the folder — open `index.html`
and watch the console. `--no-clean-urls` avoids `serve`'s default extension
redirect, which breaks the relative `./dist/app.js` reference.

## What it shows

- `fwEsbuild({ preset: 'core', sanity: 'base' })` in a build script.
- Virtual module `virtual:@awacloud/fw/preset/core`: pre-instantiated
  runtime, resolving a module via `runtime.resolve(...)`.
- Sanity layer (`base`) prefixed on the entry point (browser-only).
