---
module: graphic.scopedIds
category: svg
dependencies: []
returns: '{ createScope }'
worker-safe: true
status: complete
---

# graphic.scopedIds

> Collision-free scoped id generation and reference rewriting for repeated SVG templates.

**Module** `graphic.scopedIds` | **Source** `packages/front/graphic/anim/src/svg/scoped-ids.js` | **Type** `lib.graphic.svg` | **Version** `0.1.0` | **Deps** `[]` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { scopedIdsModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(scopedIdsModule);      // pure leaf, no transitive deps
const { createScope } = runtime.resolve('graphic.scopedIds');

// Or instantiate the descriptor directly (tests / standalone):
const { createScope } = scopedIdsModule.factory();
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `createScope` | `(prefix?: string) => Scope` | Create a fresh, isolated id scope. `prefix` defaults to `'g'`. |

### `Scope`

| Member | Signature | Description |
|--------|-----------|-------------|
| `id` | `(rawId?: string) => string` | Mint or fetch the scoped id for a raw template id. |
| `ref` | `(value: string, attrName?: string) => string` | Rewrite an attribute value that references an id. |
| `prefix` | `string` | The prefix this scope prepends to every id. |
| `seq` | `() => number` | The current in-scope counter (next id index). |

## Contract

### `scope.id(rawId)`

Deterministic **per `(scope, rawId)`**. The first sighting of a `rawId` mints
`${prefix}-${rawId}-${n}` (with `n` a monotonic in-scope counter from `0`),
records the mapping, and returns it. A repeat of the same `rawId` returns the
**same** scoped id — so every reference to it resolves. An empty or absent
`rawId` yields an anonymous `${prefix}-${n}` (always unique, never recorded).

```js
const scope = createScope('card');
scope.id('grad');   // 'card-grad-0'
scope.id('grad');   // 'card-grad-0'  (same rawId → same id, counter unchanged)
scope.id('clip');   // 'card-clip-1'
scope.id();         // 'card-2'       (anonymous)
```

### Minting discipline

Each scope draws every id — anonymous or per-`rawId` — from **one** per-instance
monotonic counter, incremented at exactly one call site and consumed **once per
unique `rawId`** (repeats are memoized and never advance it). This is the same
minting *discipline* as the fw parser's id generator
(`packages/front/fw/src/dom/rendering/parser.js`: `let _seq = 0; const nextId =
() => 'p' + (_seq++)`) — a single monotonic sequence, one increment per new id.
Only the internal structure is shared: the minted-string shape
(`${prefix}-${rawId}-${n}`), the public contract, and the collision guarantee
are graphic's own and are **byte-for-byte unchanged** by this alignment.

### `scope.ref(value, attrName)`

Rewrites a string attribute value that references an id:

- `url(#foo)` → `url(#<scoped foo>)` — the `url(#…)` syntax is unambiguous, so
  it is rewritten regardless of `attrName` (or with none passed).
- a bare `#foo` → `#<scoped foo>` — **only** when `attrName` is a known
  reference attribute (`href` or `xlink:href`).

**Forward reference**: if the referenced `rawId` was never minted, `ref` mints
it now, so a reference seen before its definition still maps consistently.

Any other value passes through unchanged.

### Colour-vs-id disambiguation

A bare `#rrggbb` value (e.g. `fill="#fff"`) is a **colour**, not an id
reference, and must pass through untouched. Since `#foo` alone is ambiguous,
`ref` rewrites a bare `#…` **only** for the `href` / `xlink:href` attributes.
Callers (the JSON→SVG builder, `graphic.svgBuild`) therefore pass the **attribute name**
to `ref`. A `url(#…)` value is always treated as a reference because the syntax
is unambiguous.

```js
scope.ref('url(#grad)', 'fill');   // 'url(#card-grad-0)'  — reference
scope.ref('#grad', 'href');        // '#card-grad-0'       — reference
scope.ref('#fff', 'fill');         // '#fff'               — colour, unchanged
scope.ref('#foo');                 // '#foo'               — ambiguous → unchanged
scope.ref(42, 'width');            // 42                   — non-string, unchanged
```

## Collision guarantee

Each `createScope()` is fully isolated: its counter and id map are per-instance,
never module-level. Two scopes instantiated over the same template produce
**disjoint** id sets when given distinct prefixes, and each resolves its own
`url(#…)` / `href` references consistently — the guarantee the legacy
JSON-regex rewriting lacked. This lets one document embed the same template many
times without id collisions.

```js
const a = createScope('card');
const b = createScope('tile');
a.id('grad');   // 'card-grad-0'
b.id('grad');   // 'tile-grad-0'   — disjoint from a
```

## Worker Usage

The module is DOM-free (no `window`, `document`, or `globalThis`) with no
module-level mutable state, so the descriptor is capture-free and serializable
to a Web Worker.

```js
const worker = fw.createWorker(['graphic.scopedIds']);
// createScope runs identically off the main thread — pure string/id logic.
```

## Notes

- Pure leaf (`dependencies: []`): mints ids from string logic alone; consumed by
  `graphic.svgBuild`'s `build(node, { idScope })` and the `graphic.scene` DSL, which pass the
  attribute name to `ref` for the colour-vs-id disambiguation.
- Out of scope: CSS-selector rewriting beyond `url(#id)` /
  `href="#id"` / `xlink:href="#id"`. Other reference syntaxes pass through.
- `seq()` exposes the counter for tests and debugging; it does not advance on a
  repeated `rawId` (the mint is memoized).
- The counter follows the fw parser's `_seq++` discipline (single monotonic
  source, minted once per unique id) — see [Minting discipline](#minting-discipline).
  This is an internal alignment only; no observable string changed.

## See also

- [graphic.svgApply](./apply.md) — the SVG attribute writer that consumes scoped ids
- [graphic.interpolate](../interpolate/index.md) — sibling pure-leaf, same Worker-safe shape
