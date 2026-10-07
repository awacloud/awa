---
module: refsLinkRefs
category: md/refs
dependencies: []
returns: object
worker-safe: true
status: complete
---

# refs/link-refs

> Map of link reference definitions `[label]: /url "title"` (CommonMark §4.7).

**Module** `refsLinkRefs` | **Source** `packages/front/office/md/src/refs/linkRefs.js` | **Deps** none | **Worker-safe** yes

Stores the link reference definitions extracted by the block parser. Labels are **normalized** (Unicode case-fold + collapsed whitespace) to match spec §4.7. The inline parser queries this map to resolve `[label]`, `[label][]`, `[text][label]` shortcuts.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const r = runtime.resolve('refsLinkRefs');
// { normalize, normalizeLabel, createLinkRefMap, addLinkRef, lookupLinkRef }
```

`refsLinkRefs` has zero dependencies, so the raw descriptor's factory also works directly:

```js
import { refsLinkRefs } from '@awacloud/md';
const r = refsLinkRefs.factory();
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `normalizeLabel` / `normalize` | `(label: string) => string` | Normalized label (case-fold + WS) |
| `createLinkRefMap` | `() => Object` | Empty map (null-prototype object) |
| `addLinkRef` | `(map, label, dest, title) => boolean` | `true` if inserted, `false` if a duplicate |
| `lookupLinkRef` | `(map, label) => {destination,title} \| null` | — |

## Examples

### Case 1 — normalization

```js
const r = refsLinkRefs.factory();
r.normalize('Foo  Bar');   // 'FOO BAR'
r.normalize('Straße'); // 'STRASSE' (Unicode fold)
```

### Case 2 — create + lookup

```js
const map = r.createLinkRefMap();
r.addLinkRef(map, 'Foo', '/url', 'Title');
r.addLinkRef(map, 'foo', '/dup', null); // false — first write wins
r.lookupLinkRef(map, 'FOO');
// { destination: '/url', title: 'Title' }
```

### Case 3 — via the `md` facade

```js
const md = runtime.resolve('md');
const ast = md.parse('[foo]: /url "title"\n\nsee [foo].');
ast.data.refmap.FOO; // { destination: '/url', title: 'title' }
```

## Notes

- Normalization = `trim()` + collapsed WS + `toLowerCase().toUpperCase()` (the sequence `commonmark.js` requires to cover the Turkish dotted I).
- First write wins: if two defs share the same normalized label, the first one wins (per spec §4.7).
- An empty label → `addLinkRef` returns `false`.
- The map stores `title: null` when no title is provided (never `undefined`).

## See also

- [`block/parser`](../block/parser.md) — populates the map
- [`inline/parser`](../inline/parser.md) — queries the map
- [`md`](../md.md) — exposes it on `ast.data.refmap`
