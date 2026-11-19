---
module: pageflip/compose
category: pageflip
name: pageflip.compose
type: lib.graphic.pageflip
dependencies: []
returns: "{ compose }"
worker-safe: true
status: complete
---

# pageflip/compose — `pageflip.compose`

> Serialize a fold polygon to a closed `M · L … · Z` path string.

**Module** `pageflip.compose` | **Type** `lib.graphic.pageflip` | **Source** `packages/front/graphic/anim/src/pageflip/compose.js` | **Deps** none | **Worker-safe** yes

## Descriptor

`pageflip.compose` is a capture-free descriptor with no dependencies and no DOM.
Its factory takes no parameter and returns `{ compose }`. It is injected into
`graphic.pageflip` through DI and is not a member of the `graphicModules`
registry.

```js
export const composeModule = {
    name: 'pageflip.compose',
    type: 'lib.graphic.pageflip',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { compose }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `compose` | `(vertices: {x,y}[]) => string` | Serialize the vertices to `M x y L x y … Z`. Coordinates are rounded to 1e-3. |

## Examples

```js
compose([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5.12345 }]);
// 'M 0 0 L 10 0 L 10 5.123 Z'
compose([]); // ''
```

## Notes

- An empty or non-array input yields `''`; it never throws.
- The first vertex is `M`, every other is `L`, and a single `Z` closes the path.
- The module owns this small serializer instead of reusing the interpolation
  module's path formatter, which works on canonical cubic segments the fold
  polygon does not need.
- Types: `src/pageflip/compose.d.ts` declares only `composeModule` as a
  `GraphicModuleDescriptor`.

## See also

- [pageflip/fold](./fold.md) — produces the polygons this module serializes
- [pageflip/pageflip](./pageflip.md) — the consumer
- [pageflip guide](../../pageflip.md) — the long form
