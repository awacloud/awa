---
module: svg3d/apply
category: svg3d
name: svg3d.apply
type: lib.graphic.svg3d
dependencies: []
returns: "{ createPolygonRig, createPathRig }"
worker-safe: false
status: complete
---

# svg3d/apply — `svg3d.apply`

> The two per-frame SVG write strategies for a projected mesh: bucketed paths or one polygon per face.

**Module** `svg3d.apply` | **Type** `lib.graphic.svg3d` | **Source** `packages/front/graphic/anim/src/svg3d/apply.js` | **Deps** none | **Worker-safe** no (DOM-bound)

## Descriptor

`svg3d.apply` is a capture-free descriptor with no declared dependencies; the
collaborators (`svgBuild`, `svgApply`, `mesh`, `idScope`) arrive per call in each
builder's `opts`. Its factory takes no parameter and returns the two rig
builders. It has a non-`graphic.*` name on purpose and is not a `graphicModules`
member.

```js
export const svg3dApplyModule = {
    name: 'svg3d.apply',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { createPolygonRig, createPathRig }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `createPathRig` | `(opts) => Rig` | The default strategy: `buckets` `<path>` elements, each a multi-subpath `d` over a contiguous painter-rank slice. |
| `createPolygonRig` | `(opts) => Rig` | The opt-in strategy: one `<polygon>` per potentially visible face. |

Common `opts`: `svgBuild` (`{ build }`), `svgApply` (`{ svgAttr }`), `mesh`,
`width` (1280), `height` (800), `idScope`. Path rig adds `buckets` (16) and
`faceColors` (`boolean` or `{ base?, shade? }`, defaults 6 and 6). Polygon rig
adds `writeFill` (default `true`; `false` skips the `fill` write).

`Rig`:

| Member | Meaning |
|--------|---------|
| `root` | The built `<svg>` root (not attached to any document here). |
| `nodeCount` | DOM nodes written per full frame (buckets, or classes × buckets with `faceColors`, or the triangle count for polygons). |
| `update(buf, count)` | Write one frame from the projector's buffers; returns the number of attribute writes. |

## Notes

- **Slot mapping, never DOM reordering**: a fixed set of elements in fixed
  document order; the k-th element receives the k-th painter-ordered face (or
  painter-rank slice). Surplus polygon slots are blanked (`points=''`) when the
  visible count shrinks; path buckets are rewritten every frame, possibly empty.
- Every attribute write goes through `svgApply.svgAttr`; elements are bound by
  reference once at build. Coordinates are quantised to 1 decimal.
- **Colours** come only from the mesh's build-time tables (`colorLut`, `baseQ`,
  `shadeLevels`, and `waterLut`, `water`, `baseLevels` with `faceColors`); none is
  built per frame. A path bucket takes the mean base and shade of its slice.
- **`faceColors`**: each slice is split into `(base + 1) × shade` colour classes
  (the extra one is water), one `<path>` per class with a fixed fill, stroked
  with the same colour at width 1 so seams close. A path whose `d` is unchanged
  is not written.
- The module imposes no triangle ceiling; `graphic.svg3d` validates the mesh size
  before calling a builder.
- No `@throws` of its own: the builders do not validate their options;
  `graphic.svg3d` builds and passes them.
- Types: `src/svg3d/apply.d.ts` declares only `svg3dApplyModule` as a
  `GraphicModuleDescriptor`.

## See also

- [svg3d/svg3d](./svg3d.md) — chooses the rig and enforces the ceilings
- [svg3d/project](./project.md) — produces the buffers the rigs consume
- [svg3d/mesh](./mesh.md) — the colour tables
- [svg/build](../svg/build.md), [svg/apply](../svg/apply.md) — the injected builder and writer
- [svg3d guide](../../svg3d.md) — the long form
