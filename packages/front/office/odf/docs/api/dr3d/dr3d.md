---
module: dr3dScene
category: odf/dr3d
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dr3dScene

> `<dr3d:scene>` 3D drawings (cube, sphere, extrude, rotate) plus lights.

**Module** `dr3dScene` | **Source** `packages/front/office/odf/src/dr3d/dr3d.js` | **Deps** `xml` | **Worker-safe** yes

Model:

```js
{
  type: 'dr3d-scene',
  attrs: {...},
  lights: [{ kind: 'dr3d:light', attrs }],
  shapes: [{ kind: 'dr3d:cube' | 'dr3d:sphere' | 'dr3d:extrude' | 'dr3d:rotate', attrs }],
  _extras?
}
```

## Resolve

```js
const dr3d = runtime.resolve('dr3dScene');
// → { is3dElementName, parseScene, renderScene, SHAPE_KINDS }
```

## API

| Method | Description |
|--------|-------------|
| `is3dElementName(name)` | Recognizes a `dr3d:*` tag (`scene`, `cube`, `sphere`, `extrude`, `rotate`, `light`). |
| `parseScene(el)` / `renderScene(s)` | Scene roundtrip. |

Constants:

- `SHAPE_KINDS` — `Set` of the shape tag names (`dr3d:cube`, `dr3d:sphere`, `dr3d:extrude`, `dr3d:rotate`); excludes `dr3d:light` and `dr3d:scene`.

## Examples

```js
const dr3d = runtime.resolve('dr3dScene');
const scene = dr3d.parseScene(sceneElement);
const el = dr3d.renderScene(scene);
```

## Notes

- Lights are split out for ergonomic access; every other shape stays in `shapes`.
- Unrecognized child elements survive in `_extras.children`.

## See also

- [API reference](../README.md)
