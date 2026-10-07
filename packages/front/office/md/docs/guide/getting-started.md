# Getting Started

`@awacloud/md` is a pure-JS, browser-only Markdown parsing/serialization library. No dependency beyond [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/fw) (workspace). This guide takes you from installation to a first parse and render, and to the pre-built bundles.

**Prerequisites**: an ES-module environment (a browser with an import map, Bun, or Node) with `@awacloud/fw` and `@awacloud/md` resolvable; no Node-only API is used by the package.

## Install

```bash
npm install @awacloud/md
```

In an HTML page, import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":  "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/": "/node_modules/@awacloud/fw/src/",
    "@awacloud/md":  "/node_modules/@awacloud/md/src/main.js",
    "@awacloud/md/": "/node_modules/@awacloud/md/src/"
}}
</script>
<script type="module" src="./app.js"></script>
```

## Factory pattern

Every module follows the `@awacloud/fw` contract (see [module-pattern](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/guide/module-pattern.md)):

```js
const descriptor = {
  name: 'md',
  dependencies: [ /* … */ ],
  factory(...deps) { /* … */ return api; }
};
```

`src/main.js` (the package root, `@awacloud/md`) is **strict factory-only**: it exports the four descriptor arrays (`fw_require`, `modules`, `extras`, `bundle`) plus every module descriptor by binding name — never a materialized/resolved instance. There is no top-level `md` singleton or `createMd` helper to import directly; instances are produced by resolving a descriptor's `factory()` through an `@awacloud/fw` `ModuleRuntime`, or via the pre-built `dist/` bundles (see below).

## First parse / render

Register the core `modules` on an `@awacloud/fw` runtime, then resolve `'md'`:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');

const ast  = md.parse('# Hello\n\n*world*');
const html = md.render(ast);          // an AST goes through `render`
// '<h1>Hello</h1>\n<p><em>world</em></p>\n'
```

`md.renderHtml(text)` takes a **string** (not an AST): it parses then renders in one step:

```js
md.renderHtml('# Hello');   // '<h1>Hello</h1>\n'
```

`modules` is topologically ordered — registering in that order guarantees every dependency is satisfied before its consumer. `runtime.register(m)` (singular, in a loop) works too; `registerAll` is just the batch form.

### Or, with the bootstrap helper

[`bootstrapMd`](../api/bootstrap.md) does the registration ceremony above in one call and returns lazy accessors:

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { md } = bootstrapMd();
md.renderHtml('# Hello');   // '<h1>Hello</h1>\n'
```

## Isolated instances (`md.createMd(opts)`)

The resolved `md` instance exposes `.createMd(opts)`, which produces a fresh, isolated instance (its own `.use()` extension list) — useful for workers or divergent configurations:

```js
const isolated = md.createMd({ sourcepos: true });
isolated.parse('# Title\n\nbody');
```

## The `.use(...)` hook

Every instance exposes `.use(ext)` to plug in an extra. The contract is:

```js
const myExtra = { name: 'myExtra', install(md) { /* patch md.parse / md.render / md.renderHtml */ } };
```

Idempotent: the same `name` is installed only once.

Extras are themselves factory descriptors — resolve one through the runtime (alongside `modules`) to get the installable `{ name, install }` object:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md            = runtime.resolve('md');
const mdFrontmatter = runtime.resolve('mdFrontmatter');

md.use(mdFrontmatter);
const ast = md.parse('---\ntitle: x\n---\n\nbody');
ast.data.frontmatter; // { lang: 'yaml', content: 'title: x' }
```

## Full bundle (all extras)

There is no separate `createMdFull` helper — resolve the `mdFullBundle` descriptor (which `.use()`-installs all 10 extras in a deterministic order) after registering `modules`, `extras` and `bundle`:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.registerAll(bundle);

const mdFull = runtime.resolve('mdFullBundle');
mdFull.renderHtml('---\ntitle: x\n---\n\n:rocket: $e=mc^2$ ==go==');
```

`mdFullBundle` chains the 10 `.use(...)` calls in a deterministic order (frontmatter first, mermaid last — see [`bundles/md-full.md`](../api/bundles/md-full.md)).

## Pre-built bundles (Worker / zero-setup)

For Worker contexts where `factory.toString()` must produce a fully serializable closure — or simply to skip the `ModuleRuntime` registration ceremony entirely — each of the 2 assembly roots (`md`, `md-full`) is available pre-built under `dist/`:

```js
import { mdBundled } from '@awacloud/md/standalone/md.js';
const md = mdBundled.factory();   // deps: [] — zero setup, ready instance
md.renderHtml('# Hello');
```

| Pre-built bundle | Dependencies | Notes |
|-------------------|--------------|-------|
| `dist/standalone/md.js` (`mdBundled`) | `[]` | Core, everything inlined. Ideal for a Worker or a zero-setup script. |
| `dist/build/md.js` (`mdPackage`) | `['secPolicy','sanitize','htmlEntities','url']` | Core, delegated to `@awacloud/fw`. |
| `dist/standalone/md-full.js` (`mdFullBundled`) | `[]` | Core + 10 extras, everything inlined. |
| `dist/build/md-full.js` (`mdFullPackage`) | `['secPolicy','sanitize','htmlEntities','url']` | Core + 10 extras, delegated to `@awacloud/fw`. |

Regeneration: `bun run gen:bundles` (idempotent).

## Concrete input → parsed AST

Source:

```md
# Title

Body with [link](https://example.com).
```

After `md.parse(text)`:

```js
ast
// → Node('document') with firstChild:
//   Node('heading', level=1) -> Node('text', literal='Title')
//   Node('paragraph') -> [
//     Node('text', literal='Body with '),
//     Node('link', destination='https://example.com') ->
//       Node('text', literal='link'),
//     Node('text', literal='.')
//   ]
```

`ast.data.refmap` exposes the map of link reference definitions.

## Next steps

- [Read+write](./read-write.md) — parse + multi-target render + roundtrip
- [Extending](./extending.md) — write an extra
- [Coverage](./coverage.md) — CommonMark + GFM + extras
- [API index](../api/README.md)
