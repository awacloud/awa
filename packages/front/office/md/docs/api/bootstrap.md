---
module: bootstrapMd
category: md
dependencies: []
returns: object
worker-safe: true
status: complete
---

# bootstrap

> Importable runtime-bootstrap primitive — registers `@awacloud/md` on an
> `@awacloud/fw` `ModuleRuntime` and returns lazy accessors, in one call.

**Module** `bootstrapMd` | **Source** `packages/front/office/md/src/bootstrap.js` | **Deps** none (a function, not a descriptor — `bootstrapMd` is a plain export, not something a `ModuleRuntime` resolves by name) | **Worker-safe** yes

## Import

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';
```

The `.js` form is the only one published — see the package's `exports` map.

## API

| Member | Type | Description |
|--------|------|-------------|
| `runtime` | `ModuleRuntime` | The runtime `bootstrapMd` registered on — the one supplied via `opts.runtime`, or a freshly created one |
| `resolve` | `(name: string) => any` | `runtime.resolve(name)` |
| `md` | `object` (getter) | Resolved `'md'` facade — carries `.createMd`, see [`md`](./md.md) |
| `mdFull` | `object` (getter) | Resolved `'mdFullBundle'` (core + 10 extras), see [`md-full`](./bundles/md-full.md) |
| `htmlDocument` | `object` (getter) | Resolved `'mdHtmlDocument'` (`{ renderFragment, build }`), see [`document/html-document`](./document/html-document.md) |

`md`, `mdFull` and `htmlDocument` are lazy getters: nothing is instantiated until accessed — `ModuleRuntime#resolve` itself resolves lazily, and `bootstrapMd` never calls it.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `runtime` | `ModuleRuntime` | a fresh `new ModuleRuntime()` | A host runtime to register on. Registration is idempotent — `ModuleRuntime.register` replaces a same-name/same-version entry, so calling `bootstrapMd` twice on the same runtime does not throw. |

Passing a `runtime` that is not a `ModuleRuntime` (missing `.register`/`.resolve`) throws a plain `TypeError` — not an `md/`-prefixed error code (see [`errors`](./errors.md)).

## Examples

### Fresh runtime

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { md, mdFull } = bootstrapMd();
md.renderHtml('# Hi\n');            // '<h1>Hi</h1>\n'
mdFull.renderHtml('==m==\n');       // contains '<mark>'
```

### Host runtime

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const runtime = new ModuleRuntime();
const { resolve } = bootstrapMd({ runtime });
resolve('mdToc').slugify('A b');    // 'a-b'
```

## Notes

- Registration is idempotent: calling `bootstrapMd({ runtime })` twice on the
  same runtime replaces the same-name/same-version entries rather than
  throwing.
- `md`, `mdFull` and `htmlDocument` are lazy getters — accessing them is what triggers
  `runtime.resolve`, not the `bootstrapMd(opts)` call itself.
- `md` and `mdFull` are the **same instance**: `mdFullBundle` installs the extras on the `md` instance the runtime already holds, so reading `mdFull` also installs them on `md` (read `md` alone and it has no extension, `md.extensions.length` is `0`; after reading `mdFull` it is `10`). For an instance that stays core-only, take `md.createMd()` before touching `mdFull`.
- `src/main.js` stays a manifest (the four `fw_require`/`modules`/`extras`/
  `bundle` arrays, nothing else) — `bootstrap.js` is the ONLY member of
  `src/` that instantiates anything.

## See also

- [`md`](./md.md) — the resolved `'md'` facade
- [`md-full`](./bundles/md-full.md) — the resolved `'mdFullBundle'`
- [Getting started](../guide/getting-started.md)
