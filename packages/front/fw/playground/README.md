# Playground

Runnable examples for `@awacloud/fw`. Each subfolder has a `README.md`
(goal, files, launch command).

| Axis | Folder | Purpose |
|---|---|---|
| **Integrations** | [`integrations/`](./integrations/README.md) | one example per integration (bundlers, frameworks, runners, runtimes) |

`starters/` and `usecases/` return after the first publication, rewritten at
the monorepo quality bar.

## Navigable index

[`index.html`](./index.html) renders [`examples.json`](./examples.json), a
dynamic index built with `@awacloud/fw` itself. Serve the **package root**,
then open `/playground/`: `npx serve --no-clean-urls .` (from
`packages/front/fw`).

Regenerate `examples.json` after adding/renaming an example:
`node playground/_tools/gen-index.mjs`.

## Resolving `@awacloud/fw` in the examples

These folders are not monorepo workspaces, so `workspace:*` is unresolvable
and `file:`/`link:` behave poorly under bun. Every example with a
`package.json` runs [`_tools/link-fw.mjs`](./_tools/link-fw.mjs) on
`postinstall`, junctioning `node_modules/@awacloud/fw` to the package root
(live source, zero copy). `npm i` / `bun install` is enough.
