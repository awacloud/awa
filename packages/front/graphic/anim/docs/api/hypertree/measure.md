---
module: hypertree/measure
category: hypertree
name: hypertree.measure
type: lib.graphic.hypertree
dependencies: []
returns: "{ wrapLabel }"
worker-safe: true
status: complete
---

# hypertree/measure — `hypertree.measure`

> Deterministic character-budget word-wrap for hypertree labels.

**Module** `hypertree.measure` | **Type** `lib.graphic.hypertree` | **Source** `packages/front/graphic/anim/src/hypertree/measure.js` | **Deps** none | **Worker-safe** yes

## Descriptor

`hypertree.measure` is a capture-free descriptor with no dependencies and no DOM.
Its factory takes no parameter and returns `{ wrapLabel }`. It is injected into
`graphic.hypertree` through DI and is not a `graphicModules` member.

```js
export const hypertreeMeasureModule = {
    name: 'hypertree.measure',
    type: 'lib.graphic.hypertree',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { wrapLabel }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `wrapLabel` | `(text: string \| number \| null \| undefined, maxLabel: number) => string[]` | Break `text` into lines of at most `maxLabel` characters at word boundaries. |

## Examples

```js
wrapLabel('radial tree focus', 10); // ['radial', 'tree focus']
wrapLabel('extraordinarily', 6);    // ['extrao', 'rdinar', 'ily']
wrapLabel('  ', 10);                // []
wrapLabel('a b c', 0);              // ['a b c']
```

## Notes

- A nullish, empty or whitespace-only label yields `[]`.
- `maxLabel <= 0` (after flooring) disables wrapping: one line, the words joined
  by single spaces.
- A single word longer than `maxLabel` is hard-broken into `maxLabel`-sized chunks.
- Words are separated on any whitespace run; the output normalizes runs to one
  space.
- The wrap counts characters, not pixels, so it is deterministic across fonts.
  Pixel-accurate measurement is not provided.
- It never throws.
- Types: `src/hypertree/measure.d.ts` declares only `hypertreeMeasureModule` as a
  `GraphicModuleDescriptor`.

## See also

- [hypertree/hypertree](./hypertree.md) — uses it for default-look labels (`maxLabel` option)
- [hypertree/layout](./layout.md) — the other injected kernel
- [hypertree guide](../../hypertree.md) — the long form
