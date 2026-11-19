---
module: svg3d/mesh
category: svg3d
name: svg3d.mesh
type: lib.graphic.svg3d
dependencies: [svg3d.vec3]
returns: "{ BASE_LEVELS, SHADE_LEVELS, decodeHeightmap, buildColorLut, buildGridMesh }"
worker-safe: true
status: complete
---

# svg3d/mesh — `svg3d.mesh`

> Decode a heightmap and build a static grid mesh with precomputed normals and colours.

**Module** `svg3d.mesh` | **Type** `lib.graphic.svg3d` | **Source** `packages/front/graphic/anim/src/svg3d/mesh.js` | **Deps** `svg3d.vec3` | **Worker-safe** yes

## Descriptor

`svg3d.mesh` is a capture-free descriptor. Its factory takes the resolved
`svg3d.vec3` as `vec3` and returns the constants and three functions. It has a
non-`graphic.*` name on purpose and is not a `graphicModules` member.

```js
export const svg3dMeshModule = {
    name: 'svg3d.mesh',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: ['svg3d.vec3'],
    deps: [svg3dVec3Module],
    factory(vec3) { /* … */ return { BASE_LEVELS, SHADE_LEVELS, decodeHeightmap,
        buildColorLut, buildGridMesh }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `BASE_LEVELS` | `16` | Quantised base-colour buckets in the colour table. |
| `SHADE_LEVELS` | `33` | Quantised shade levels. |
| `decodeHeightmap` | `(source) => { side, heights: Float64Array }` | Decode either accepted shape into normalised samples. |
| `buildColorLut` | `() => string[]` | The `BASE_LEVELS × SHADE_LEVELS` `#rrggbb` table; index `lut[baseQ * SHADE_LEVELS + shadeQ]`. |
| `buildGridMesh` | `(opts: { cells, heights?, spacing?, heightScale? }) => Mesh` | Build the mesh. `cells` is quads per side; `heights` is a value array, either heightmap shape, or omitted (flat plane). |

Accepted heightmap shapes: `{ side, heights }` (values copied, expected in
`[0, 1]`) or `{ data, width, height }` (an `ImageData`-shaped view; the red
channel at stride 4, divided by 255; `width` must equal `height`).

`Mesh` fields: `cells`, `side` (`cells + 1`), `vertexCount`, `triangleCount`
(`2·cells²`), `spacing` (default 40), `heightScale` (default 220), `positions`
(`Float64Array`, `y` negative-up), `indices` (`Uint32Array`), `normals` and
`normalLen` (static face normals and lengths), `centroids`, `baseQ`, `water`
(1 when the face's three samples are 0), `waterLut`, `baseLevels`, `shadeLevels`,
`colorLut`.

## Notes

- **`decodeHeightmap` throws** `TypeError` on a non-object, an unrecognised
  shape, a non-integer or `< 1` `width`/`height`/`side`, or a non-square image;
  `RangeError` when the payload is shorter than the declared size, or a
  `heights` array whose length is not `side²`.
- **`buildGridMesh` throws** `TypeError` when `cells` is not an integer `>= 1`;
  `RangeError` when `heights` does not match the grid (a value array of the wrong
  length, or a decoded heightmap of a different side).
- **No Canvas**: the heightmap arrives already decoded. An application that
  starts from an image performs the draw and `getImageData` itself.
- Face normals, their lengths, centroids and the colour tables are computed once
  at build, because they are static for a rigid mesh under a moving camera.
- Winding makes a face normal point `−y` (up), so a camera above the terrain sees
  the front faces.
- Grid sizes: 16, 32 and 64 cells give 512, 2048 and 8192 triangles.
- No DOM or Canvas global is referenced.
- Types: `src/svg3d/mesh.d.ts` declares only `svg3dMeshModule` as a
  `GraphicModuleDescriptor`.

## See also

- [svg3d/vec3](./vec3.md) — the dependency
- [svg3d/project](./project.md) — consumes the mesh
- [svg3d/apply](./apply.md) — reads the mesh colour tables
- [svg3d guide](../../svg3d.md) — the long form
