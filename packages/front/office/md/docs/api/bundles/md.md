---
module: md
category: md/bundles
dependencies: [mdErrors, blockParser, inlineParser, inlineParserBuilder, renderHtmlMod, renderMarkdownMod, sanitize]
returns: object
worker-safe: true
status: complete
---

# md (core — not a separate bundle)

> The "core bundle" is simply the [`md`](../md.md) module (`mdMod`) itself: no wrapper descriptor sits around it.

**Prerequisites**: the runtime registration shown below, or the pre-built `dist/standalone/md.js`.

Only `md-full` is a bundle descriptor: `src/bundles/` holds just `md-full.js` (see [`bundles/md-full.md`](./md-full.md)). The `@awacloud/md/md` sub-path (`package.json#exports["./md"]`) maps to `./src/md.js`, i.e. the `mdMod` descriptor documented at [`api/md.md`](../md.md), not to a bundle file. Importing it gives you the raw descriptor, not a ready instance (`@awacloud/md`'s package root is strict factory-only, see [Getting started](../../guide/getting-started.md)).

## Getting the core surface

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');
md.renderHtml('# Hi');
// '<h1>Hi</h1>\n'
```

Isolated instance:

```js
const m1 = md.createMd();
const m2 = md.createMd({ extendedAutolinks: false });
```

Zero-setup alternative (pre-built, no registration needed):

```js
import { mdBundled } from '@awacloud/md/standalone/md.js';
const md = mdBundled.factory();   // deps: []
```

## Notes

- No extension is installed by default. For extras, use [`md-full`](./md-full.md) or chain `.use(...)` manually.
- The pre-built roots `md` and `md-full` under `dist/` (`dist/build/` and `dist/standalone/`) are generated from the same sources by `bun run gen:bundles`.

## See also

- [`md-full`](./md-full.md) — version with all extras
- [`md`](../md.md) — the actual API of the instance
- [Getting started](../../guide/getting-started.md)
